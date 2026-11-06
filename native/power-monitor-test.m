#define CAFMODA_POWER_TEST
#include "power-monitor.m"
#include <assert.h>

static void save(NSString *path, NSArray *changes) {
  NSData *data = [NSJSONSerialization dataWithJSONObject:@{@"version": @1, @"changes": changes} options:0 error:NULL];
  assert([data writeToFile:path atomically:YES]);
}
static NSArray *load(NSString *path) {
  return [NSJSONSerialization JSONObjectWithData:[NSData dataWithContentsOfFile:path] options:0 error:NULL][@"changes"];
}

int main(void) {
  @autoreleasepool {
    NSDictionary *snapshot = powerSnapshot();
    assert(snapshot[@"onBattery"] != nil && snapshot[@"lowPowerMode"] != nil);
    powerChanged(NULL);
    rootChanged(NULL, 0, 0, NULL);
    assert(readSetting(@"disablesleep") != nil);
    assert(!validJournal(@{@"version": @YES, @"changes": @[]}));
    assert(!validJournal(@{@"version": @1, @"changes": @[@{@"key": @"sleep", @"before": @YES, @"after": @0}]}));
    assert(!validJournal(@{@"version": @1, @"changes": @[@{@"key": @"sleep; reboot", @"before": @5, @"after": @0}]}));
    NSString *directory = [NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString];
    assert([NSFileManager.defaultManager createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:nil error:NULL]);
    NSString *path = [directory stringByAppendingPathComponent:@"recovery.json"];
    assert(recover(path)); // Missing journal never changes the machine.
    assert(writeSetting(path, @"sleep", @"0") != 0); // No journal, no mutation.
    save(path, @[]);
    assert(recover(path)); // Empty journal never changes the machine.
    NSArray *changes = @[@{@"key": @"sleep", @"before": @17, @"after": @0},
      @{@"key": @"lowpowermode", @"before": @0, @"after": @1}];
    NSMutableDictionary *values = [@{@"sleep": @0, @"lowpowermode": @1} mutableCopy];
    NSNumber *(^reader)(NSString *) = ^NSNumber *(NSString *key) { return values[key]; };
    BOOL (^writer)(NSString *, NSNumber *) = ^BOOL(NSString *key, NSNumber *value) { values[key] = value; return YES; };
    save(path, changes);
    assert(recoverWithIO(path, reader, writer));
    assert([values[@"sleep"] isEqual:@17] && [values[@"lowpowermode"] isEqual:@0]);
    assert(load(path).count == 0);

    save(path, changes);
    values[@"sleep"] = @42; // External change must survive recovery.
    values[@"lowpowermode"] = @1;
    assert(recoverWithIO(path, reader, writer));
    assert([values[@"sleep"] isEqual:@42]);

    save(path, changes);
    values[@"sleep"] = @0;
    values[@"lowpowermode"] = @1;
    assert(!recoverWithIO(path, reader, ^BOOL(NSString *key, NSNumber *value) {
      if ([key isEqual:@"sleep"]) return NO;
      return writer(key, value);
    }));
    assert(load(path).count == 1);
    assert([values[@"lowpowermode"] isEqual:@0]);
    [values removeObjectForKey:@"sleep"];
    assert(!recoverWithIO(path, reader, writer)); // Failed read retains recovery.
    assert(load(path).count == 1);
    values[@"sleep"] = @0;
    assert(recoverWithIO(path, reader, writer));
    assert([values[@"sleep"] isEqual:@17]);
    assert([NSFileManager.defaultManager removeItemAtPath:directory error:NULL]);
    puts("PASS: native power snapshots, journal validation, exact recovery, partial failures, and external changes");
  }
  return 0;
}
