#import <Cocoa/Cocoa.h>
#include <stdint.h>

// Own a standard status-item menu: AppKit opens it for either mouse button.
// No event monitors, synthetic mouse events, or Laufey internals are involved.
typedef void (*CafmodaMenuClick)(const char *identifier);

#ifdef CAFMODA_TRAY_TESTING
static void scheduleRuntimeTest(void);
#endif

@interface CafmodaTray : NSObject
@property(nonatomic, strong) NSStatusItem *statusItem;
@property(nonatomic, strong) NSImage *lightImage;
@property(nonatomic, strong) NSImage *darkImage;
@property(nonatomic) CafmodaMenuClick onClick;
- (void)updateImage;
- (void)menuClicked:(NSMenuItem *)sender;
@end

@implementation CafmodaTray
- (void)updateImage {
  NSAppearanceName appearance = [self.statusItem.button.effectiveAppearance
      bestMatchFromAppearancesWithNames:@[NSAppearanceNameAqua, NSAppearanceNameDarkAqua]];
  self.statusItem.button.image = [appearance isEqualToString:NSAppearanceNameDarkAqua]
      ? (self.darkImage ?: self.lightImage) : self.lightImage;
}
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object
    change:(NSDictionary *)change context:(void *)context {
  (void)keyPath; (void)object; (void)change; (void)context;
  [self updateImage];
}
- (void)menuClicked:(NSMenuItem *)sender {
  if (self.onClick != NULL && sender.representedObject != nil) {
    self.onClick([sender.representedObject UTF8String]);
  }
}
@end

static CafmodaTray *tray;

static void onMain(void (^work)(void)) {
  if ([NSThread isMainThread]) work();
  else dispatch_sync(dispatch_get_main_queue(), work);
}

void cafmoda_tray_destroy(void) {
  onMain(^{
    if (tray == nil) return;
    [tray.statusItem.button removeObserver:tray forKeyPath:@"effectiveAppearance"];
    tray.onClick = NULL;
    [[NSStatusBar systemStatusBar] removeStatusItem:tray.statusItem];
    tray = nil;
  });
}

int cafmoda_tray_create(CafmodaMenuClick onClick) {
  __block int created = 0;
  onMain(^{
    cafmoda_tray_destroy();
    tray = [CafmodaTray new];
    tray.statusItem = [[NSStatusBar systemStatusBar] statusItemWithLength:NSSquareStatusItemLength];
    tray.onClick = onClick;
    [tray.statusItem.button addObserver:tray forKeyPath:@"effectiveAppearance" options:0 context:NULL];
    created = tray.statusItem.button != nil;
  });
  return created;
}

void cafmoda_tray_set_icon(const void *bytes, uint32_t length, int dark) {
  NSData *data = [NSData dataWithBytes:bytes length:length];
  onMain(^{
    NSImage *image = length == 0 ? nil : [[NSImage alloc] initWithData:data];
    image.size = NSMakeSize(22, 22);
    if (dark) tray.darkImage = image;
    else tray.lightImage = image;
    [tray updateImage];
  });
}

void cafmoda_tray_set_tooltip(const char *text) {
  NSString *tooltip = [NSString stringWithUTF8String:text];
  onMain(^{ tray.statusItem.button.toolTip = tooltip; });
}

int cafmoda_tray_set_menu(const char *json) {
  NSData *data = [[NSString stringWithUTF8String:json] dataUsingEncoding:NSUTF8StringEncoding];
  NSArray *items = [NSJSONSerialization JSONObjectWithData:data options:0 error:NULL];
  if (![items isKindOfClass:[NSArray class]]) return 0;
  __block int installed = 0;
  onMain(^{
    if (tray == nil) return;
    NSMenu *menu = [NSMenu new];
    menu.autoenablesItems = NO;
    for (id entry in items) {
      if ([entry isKindOfClass:[NSString class]] && [entry isEqualToString:@"separator"]) {
        [menu addItem:[NSMenuItem separatorItem]];
        continue;
      }
      if (![entry isKindOfClass:[NSDictionary class]]) return;
      NSDictionary *properties = entry[@"item"];
      if (![properties isKindOfClass:[NSDictionary class]] ||
          ![properties[@"label"] isKindOfClass:[NSString class]]) return;
      NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:properties[@"label"]
          action:@selector(menuClicked:) keyEquivalent:@""];
      item.target = tray;
      item.representedObject = properties[@"id"];
      item.enabled = [properties[@"enabled"] boolValue];
      item.state = [properties[@"checked"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
      item.toolTip = properties[@"tooltip"];
      [menu addItem:item];
    }
    tray.statusItem.menu = menu;
    installed = 1;
#ifdef CAFMODA_TRAY_TESTING
    scheduleRuntimeTest();
#endif
  });
  return installed;
}
