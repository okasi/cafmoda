#import "tray-menu.m"
#include <assert.h>
#include <stdio.h>

#import "tray-test-support.h"

static unsigned selections;
static void menuClick(const char *identifier) {
  assert(strcmp(identifier, "test-toggle") == 0);
  selections++;
}

int main(void) {
  @autoreleasepool {
    [NSApplication sharedApplication];
    [NSApp setActivationPolicy:NSApplicationActivationPolicyAccessory];
    [NSApp finishLaunching];
    pid_t foreground = NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier;
    assert(cafmoda_tray_create(menuClick) == 1);
    NSData *light = [NSData dataWithContentsOfFile:@"icons/tray-00.png"];
    NSData *dark = [NSData dataWithContentsOfFile:@"icons/tray-00-dark.png"];
    assert(light != nil && dark != nil);
    cafmoda_tray_set_icon(light.bytes, (uint32_t)light.length, 0);
    cafmoda_tray_set_icon(dark.bytes, (uint32_t)dark.length, 1);
    cafmoda_tray_set_tooltip("Cafmoda native menu test");
    assert([tray.statusItem.button.toolTip isEqualToString:@"Cafmoda native menu test"]);
    const char *json = "[{\"item\":{\"label\":\"Cafmoda\",\"enabled\":false}},\"separator\","
        "{\"item\":{\"label\":\"Test Toggle\",\"id\":\"test-toggle\",\"enabled\":true,\"checked\":true}}]";
    assert(cafmoda_tray_set_menu(json) == 1);
    NSMenu *menu = tray.statusItem.menu;
    assert(menu.numberOfItems == 3);
    assert(![menu itemAtIndex:0].enabled);
    assert([menu itemAtIndex:1].separatorItem);
    assert([menu itemAtIndex:2].state == NSControlStateValueOn);
    assert(!menu.autoenablesItems);
    assert(cafmoda_tray_set_menu("invalid json") == 0);
    assert(tray.statusItem.menu == menu);
    [[NSRunLoop mainRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.2]];
    runMenuCycles(menu);
    assert(selections == 6);
    assert(NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier == foreground);

    tray.statusItem.button.appearance = [NSAppearance appearanceNamed:NSAppearanceNameAqua];
    assert(tray.statusItem.button.image == tray.lightImage);
    tray.statusItem.button.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    assert(tray.statusItem.button.image == tray.darkImage);
    assert(cafmoda_tray_create(menuClick) == 1); // HMR replaces the old item.
    assert(tray.statusItem.menu == nil);
    cafmoda_tray_destroy();
    cafmoda_tray_destroy();
    assert(tray == nil);
    puts("Passed native AppKit menu integration, icons, menu state, callbacks, recreation, teardown");
  }
  return 0;
}
