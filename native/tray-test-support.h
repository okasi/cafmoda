static unsigned menuOpens;
static NSRect menuFrame;

@interface MenuProbe : NSObject <NSMenuDelegate>
@end
@implementation MenuProbe
- (void)menuWillOpen:(NSMenu *)menu {
  menuOpens++;
  NSTimer *timer = [NSTimer timerWithTimeInterval:0.1 repeats:NO block:^(NSTimer *timer) {
    (void)timer;
    menuFrame = menu.accessibilityFrame;
    [menu performActionForItemAtIndex:2];
    [menu cancelTracking];
  }];
  [[NSRunLoop mainRunLoop] addTimer:timer forMode:NSEventTrackingRunLoopMode];
  [[NSRunLoop mainRunLoop] addTimer:timer forMode:NSRunLoopCommonModes];
}
@end

static NSEvent *mouseEvent(NSEventType type) {
  NSStatusBarButton *button = tray.statusItem.button;
  NSPoint center = NSMakePoint(NSMidX(button.bounds), NSMidY(button.bounds));
  return [NSEvent mouseEventWithType:type
      location:[button convertPoint:center toView:nil] modifierFlags:0
      timestamp:NSProcessInfo.processInfo.systemUptime
      windowNumber:button.window.windowNumber context:nil eventNumber:1
      clickCount:1 pressure:1];
}

static void runMenuCycles(NSMenu *menu) {
  menuOpens = 0;
  MenuProbe *probe = [MenuProbe new];
  menu.delegate = probe;
  pid_t foreground = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
  // Exercise the real NSStatusBarButton mouse handlers and AppKit's menu
  // tracking loop. The old test bypassed both by calling a monitor block.
  for (unsigned attempt = 0; attempt < 3; attempt++) {
    [NSApp postEvent:mouseEvent(NSEventTypeLeftMouseUp) atStart:YES];
    [NSApp postEvent:mouseEvent(NSEventTypeLeftMouseDown) atStart:YES];
    [NSApp sendEvent:[NSApp nextEventMatchingMask:NSEventMaskLeftMouseDown untilDate:[NSDate distantFuture] inMode:NSDefaultRunLoopMode dequeue:YES]];
    assert(menuOpens == attempt * 2 + 1);
    assert(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier == foreground);
    NSRect leftFrame = menuFrame;
    assert(leftFrame.size.width > 0 && leftFrame.size.height > 0);
    // The icon artwork is padded inside the menu bar's status-item window.
    // Compare the menu to the bar edge, not to the image's inner rectangle.
    NSRect statusBarFrame = tray.statusItem.button.window.frame;
    assert(fabs(NSMaxY(leftFrame) - NSMinY(statusBarFrame)) <= 2);
    [NSApp postEvent:mouseEvent(NSEventTypeRightMouseUp) atStart:YES];
    [NSApp postEvent:mouseEvent(NSEventTypeRightMouseDown) atStart:YES];
    [NSApp sendEvent:[NSApp nextEventMatchingMask:NSEventMaskRightMouseDown untilDate:[NSDate distantFuture] inMode:NSDefaultRunLoopMode dequeue:YES]];
    assert(menuOpens == attempt * 2 + 2);
    assert(NSEqualRects(leftFrame, menuFrame));
    assert(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier == foreground);
    printf("Native menu cycle %u: left/right opened, same frame, callbacks delivered, foreground unchanged\n", attempt + 1);
  }

  menu.delegate = nil;
}
