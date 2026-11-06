#define CAFMODA_TRAY_TESTING
#import "tray-menu.m"
#include <assert.h>
#include <stdio.h>
#import "tray-test-support.h"

static void scheduleRuntimeTest(void) {
  static BOOL scheduled = NO;
  if (scheduled) return;
  scheduled = YES;
  // Let the packaged desktop runtime finish startup and publish the status item.
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 300 * NSEC_PER_MSEC),
      dispatch_get_main_queue(), ^{
    runMenuCycles(tray.statusItem.menu);
    NSString *result = NSProcessInfo.processInfo.environment[@"CAFMODA_TRAY_TEST_RESULT"];
    assert(result != nil);
    assert([@"native menu cycles passed" writeToFile:result atomically:YES
        encoding:NSUTF8StringEncoding error:NULL]);
  });
}
