#import <Cocoa/Cocoa.h>
#import <IOKit/IOKitLib.h>
#import <IOKit/ps/IOPowerSources.h>
#import <IOKit/ps/IOPSKeys.h>
#include <sys/file.h>
#include <fcntl.h>
#include <limits.h>
#include <math.h>
#include <signal.h>
#include <unistd.h>

static NSDictionary *powerSnapshot(void) {
  BOOL present = NO, battery = YES;
  NSNumber *percent = nil;
  CFTypeRef info = IOPSCopyPowerSourcesInfo();
  if (info) {
    CFStringRef source = IOPSGetProvidingPowerSourceType(info);
    if (source) battery = CFEqual(source, CFSTR(kIOPSBatteryPowerValue));
    CFArrayRef sources = IOPSCopyPowerSourcesList(info);
    if (sources) {
      for (CFIndex i = 0; i < CFArrayGetCount(sources); i++) {
        NSDictionary *description = (__bridge NSDictionary *)IOPSGetPowerSourceDescription(info,
            CFArrayGetValueAtIndex(sources, i));
        if (![description[@kIOPSTypeKey] isEqual:@kIOPSInternalBatteryType]) continue;
        present = YES;
        NSNumber *capacity = description[@kIOPSCurrentCapacityKey];
        NSNumber *maximum = description[@kIOPSMaxCapacityKey];
        if (capacity && maximum.doubleValue > 0) {
          percent = @(100.0 * capacity.doubleValue / maximum.doubleValue);
        }
      }
      CFRelease(sources);
    }
    CFRelease(info);
  }
  id closed = NSNull.null;
  io_service_t root = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("IOPMrootDomain"));
  if (root) {
    CFTypeRef value = IORegistryEntryCreateCFProperty(root, CFSTR("AppleClamshellState"), kCFAllocatorDefault, 0);
    if (value) {
      if (CFGetTypeID(value) == CFBooleanGetTypeID()) closed = @((BOOL)CFBooleanGetValue(value));
      CFRelease(value);
    }
    IOObjectRelease(root);
  }
  return @{ @"batteryPresent": @(present), @"onBattery": @(battery),
    @"percent": percent ?: NSNull.null, @"lidClosed": closed,
    @"lowPowerMode": @(NSProcessInfo.processInfo.lowPowerModeEnabled) };
}

static NSData *lastSnapshot;
static void emitSnapshot(void) {
  @autoreleasepool {
    NSData *data = [NSJSONSerialization dataWithJSONObject:powerSnapshot() options:NSJSONWritingSortedKeys error:NULL];
    if ([lastSnapshot isEqual:data]) return;
    lastSnapshot = data;
    fwrite(data.bytes, 1, data.length, stdout);
    fputc('\n', stdout);
    fflush(stdout);
  }
}
static void powerChanged(void *context) { (void)context; emitSnapshot(); }
static void rootChanged(void *context, io_service_t service, uint32_t type, void *argument) {
  (void)context; (void)service; (void)type; (void)argument;
  emitSnapshot();
}

static NSString *run(NSArray<NSString *> *arguments, BOOL *ok) {
  NSTask *task = [NSTask new];
  task.executableURL = [NSURL fileURLWithPath:arguments.firstObject];
  task.arguments = [arguments subarrayWithRange:NSMakeRange(1, arguments.count - 1)];
  NSPipe *pipe = [NSPipe pipe];
  task.standardOutput = pipe;
  task.standardError = pipe;
  NSError *error = nil;
  if (![task launchAndReturnError:&error]) { *ok = NO; return error.description; }
  NSData *data = [pipe.fileHandleForReading readDataToEndOfFile];
  [task waitUntilExit];
  *ok = task.terminationStatus == 0;
  return [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] ?: @"";
}
static NSNumber *setting(NSString *text, NSString *key) {
  NSRegularExpression *regex = [NSRegularExpression regularExpressionWithPattern:
    [NSString stringWithFormat:@"(?m)^\\s*%@\\s+(\\d+)(?:\\s|$)", key] options:0 error:NULL];
  NSTextCheckingResult *match = [regex firstMatchInString:text options:0 range:NSMakeRange(0, text.length)];
  return match ? @([[text substringWithRange:[match rangeAtIndex:1]] longLongValue]) : nil;
}
static NSNumber *readSetting(NSString *key) {
  BOOL ok;
  NSString *text = run(@[@"/usr/bin/pmset", @"-g", [key isEqual:@"disablesleep"] ? @"live" : @"custom"], &ok);
  if (!ok) return nil;
  if ([key isEqual:@"disablesleep"]) return setting(text, @"SleepDisabled");
  NSRange start = [text rangeOfString:@"Battery Power:"];
  if (start.location == NSNotFound) return nil;
  text = [text substringFromIndex:NSMaxRange(start)];
  NSRange end = [text rangeOfString:@"AC Power:"];
  if (end.location != NSNotFound) text = [text substringToIndex:end.location];
  return setting(text, key);
}
static BOOL validJournal(id journal) {
  if (![journal isKindOfClass:NSDictionary.class] || ![journal[@"version"] isEqual:@1] ||
      CFGetTypeID((__bridge CFTypeRef)journal[@"version"]) == CFBooleanGetTypeID() ||
      ![journal[@"changes"] isKindOfClass:NSArray.class]) return NO;
  NSMutableSet *seen = [NSMutableSet set];
  for (id change in journal[@"changes"]) {
    if (![change isKindOfClass:NSDictionary.class]) return NO;
    NSString *key = change[@"key"];
    if (![@[@"sleep", @"disablesleep", @"lowpowermode", @"powermode"] containsObject:key] || [seen containsObject:key]) return NO;
    [seen addObject:key];
    double maximum = [key isEqual:@"sleep"] ? INT_MAX : [key isEqual:@"powermode"] ? 2 : 1;
    for (NSString *field in @[@"before", @"after"]) {
      id number = change[field];
      if (![number isKindOfClass:NSNumber.class] || CFGetTypeID((__bridge CFTypeRef)number) == CFBooleanGetTypeID()) return NO;
      double value = [number doubleValue];
      if (!isfinite(value) || value < 0 || value > maximum || floor(value) != value) return NO;
    }
  }
  return YES;
}
static BOOL recoverWithIO(NSString *path, NSNumber *(^readValue)(NSString *), BOOL (^writeValue)(NSString *, NSNumber *)) {
  NSData *data = [NSData dataWithContentsOfFile:path];
  if (!data) return ![NSFileManager.defaultManager fileExistsAtPath:path];
  NSDictionary *journal = [NSJSONSerialization JSONObjectWithData:data options:0 error:NULL];
  if (!validJournal(journal)) { fprintf(stderr, "Invalid power recovery journal; leaving settings untouched\n"); return NO; }
  NSMutableArray *remaining = [journal[@"changes"] mutableCopy];
  for (NSDictionary *change in [remaining.copy reverseObjectEnumerator]) {
    NSString *key = change[@"key"];
    NSNumber *current = readValue(key);
    if (!current) continue;
    if ([current isEqual:change[@"after"]]) {
      if (!writeValue(key, change[@"before"]) || ![readValue(key) isEqual:change[@"before"]]) continue;
    }
    NSMutableArray *next = [remaining mutableCopy];
    [next removeObject:change];
    NSData *updated = [NSJSONSerialization dataWithJSONObject:@{@"version": @1, @"changes": next} options:0 error:NULL];
    if (![updated writeToFile:path options:NSDataWritingAtomic error:NULL]) return NO;
    remaining = next;
  }
  return remaining.count == 0;
}
static BOOL recover(NSString *path) {
  // A child write survives an owner crash. Wait until it finishes before
  // checking the live value, so its delayed completion cannot strand a setting.
  int lock = open([[path stringByAppendingString:@".mutation-lock"] fileSystemRepresentation], O_CREAT | O_RDWR | O_CLOEXEC, 0600);
  if (lock < 0) return NO;
  if (flock(lock, LOCK_EX) != 0) { close(lock); return NO; }
  BOOL restored = recoverWithIO(path, ^NSNumber *(NSString *key) { return readSetting(key); },
    ^BOOL(NSString *key, NSNumber *value) {
      BOOL ok;
      run(@[@"/usr/bin/sudo", @"-n", @"/usr/bin/pmset", @"-b", key, value.stringValue], &ok);
      return ok;
    });
  close(lock);
  return restored;
}

static int writeSetting(NSString *path, NSString *key, NSString *text) {
  int lock = open([[path stringByAppendingString:@".mutation-lock"] fileSystemRepresentation], O_CREAT | O_RDWR | O_CLOEXEC, 0600);
  if (lock < 0) return 1;
  if (flock(lock, LOCK_EX) != 0) { close(lock); return 1; }
  NSDictionary *journal = [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:path] ?: [NSData data] options:0 error:NULL];
  int result = 1;
  if (validJournal(journal)) {
    for (NSDictionary *change in journal[@"changes"]) {
      if (![change[@"key"] isEqual:key]) continue;
      NSNumber *value = nil;
      if ([text isEqual:[change[@"after"] stringValue]]) value = change[@"after"];
      else if ([text isEqual:[change[@"before"] stringValue]]) value = change[@"before"];
      if (!value) break;
      NSNumber *current = readSetting(key);
      NSNumber *expected = [value isEqual:change[@"after"]] ? change[@"before"] : change[@"after"];
      if ([current isEqual:value]) { result = 0; break; }
      if (![current isEqual:expected]) break;
      BOOL ok;
      run(@[@"/usr/bin/sudo", @"-n", @"/usr/bin/pmset", @"-b", key, text], &ok);
      if (ok && [readSetting(key) isEqual:value]) result = 0;
      break;
    }
  }
  close(lock);
  if (result) fprintf(stderr, "Write refused or failed; recovery journal retained\n");
  return result;
}

#ifndef CAFMODA_POWER_TEST
int main(int argc, const char *argv[]) {
  @autoreleasepool {
    signal(SIGPIPE, SIG_IGN);
    if (argc == 2 && strcmp(argv[1], "--snapshot") == 0) { emitSnapshot(); return 0; }
    if (argc == 5 && strcmp(argv[1], "--write") == 0) return writeSetting(@(argv[2]), @(argv[3]), @(argv[4]));
    if (argc != 3 || strcmp(argv[1], "--watch") != 0) return 2;
    NSString *journalPath = @(argv[2]);
    int lock = open([[journalPath stringByAppendingString:@".lock"] fileSystemRepresentation], O_CREAT | O_RDWR | O_CLOEXEC, 0600);
    if (lock < 0 || flock(lock, LOCK_EX | LOCK_NB) != 0) {
      fprintf(stderr, "Another Cafmoda power monitor is running\n"); return 1;
    }
    CFRunLoopSourceRef source = IOPSNotificationCreateRunLoopSource(powerChanged, NULL);
    if (!source) { fprintf(stderr, "Power notifications unavailable\n"); return 1; }
    CFRunLoopAddSource(CFRunLoopGetMain(), source, kCFRunLoopCommonModes);
    IONotificationPortRef port = IONotificationPortCreate(kIOMainPortDefault);
    io_service_t root = IOServiceGetMatchingService(kIOMainPortDefault, IOServiceMatching("IOPMrootDomain"));
    io_object_t interest = IO_OBJECT_NULL;
    if (!port || !root || IOServiceAddInterestNotification(port, root, kIOGeneralInterest, rootChanged, NULL, &interest) != KERN_SUCCESS) {
      fprintf(stderr, "Lid notifications unavailable\n"); return 1;
    }
    CFRunLoopAddSource(CFRunLoopGetMain(), IONotificationPortGetRunLoopSource(port), kCFRunLoopCommonModes);
    [NSNotificationCenter.defaultCenter addObserverForName:NSProcessInfoPowerStateDidChangeNotification
      object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) { (void)note; emitSnapshot(); }];
    [NSWorkspace.sharedWorkspace.notificationCenter addObserverForName:NSWorkspaceDidWakeNotification
      object:nil queue:NSOperationQueue.mainQueue usingBlock:^(NSNotification *note) { (void)note; lastSnapshot = nil; emitSnapshot(); }];
    // EOF arrives even after a force quit. The monitor survives long enough to
    // restore the durable journal, without polling the owner's process ID.
    dispatch_source_t input = dispatch_source_create(DISPATCH_SOURCE_TYPE_READ, STDIN_FILENO, 0, dispatch_get_main_queue());
    dispatch_source_set_event_handler(input, ^{
      char bytes[128];
      ssize_t count = read(STDIN_FILENO, bytes, sizeof(bytes));
      if (count > 0) { lastSnapshot = nil; emitSnapshot(); return; }
      if (count == 0) {
        BOOL restored = recover(journalPath);
        if (!restored) fprintf(stderr, "Power recovery pending; journal retained for next launch\n");
        exit(restored ? 0 : 1);
      }
    });
    dispatch_resume(input);
    emitSnapshot();
    [NSRunLoop.mainRunLoop run];
  }
  return 0;
}
#endif
