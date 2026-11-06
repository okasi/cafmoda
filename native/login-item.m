#import <Cocoa/Cocoa.h>
#include <mach-o/dyld.h>

// A distinctly named login executable makes macOS identify this background
// item as cafmoda-anti-sleep instead of the generic /usr/bin/open command.
int main(void) {
  @autoreleasepool {
    uint32_t size = 0;
    _NSGetExecutablePath(NULL, &size);
    char *path = malloc(size);
    if (path == NULL || _NSGetExecutablePath(path, &size) != 0) {
      free(path);
      return EXIT_FAILURE;
    }
    NSString *executable = [[NSString stringWithUTF8String:path] stringByResolvingSymlinksInPath];
    free(path);
    NSURL *app = [NSURL fileURLWithPath:executable];
    for (unsigned i = 0; i < 3; i++) app = app.URLByDeletingLastPathComponent;
    if (![[NSBundle bundleWithURL:app].bundleIdentifier isEqualToString:@"dev.osim.cafmoda"]) {
      fprintf(stderr, "cafmoda-anti-sleep: could not locate the Cafmoda app bundle\n");
      return EXIT_FAILURE;
    }
    for (NSRunningApplication *running in
        [NSRunningApplication runningApplicationsWithBundleIdentifier:@"dev.osim.cafmoda"]) {
      if (running.processIdentifier != NSProcessInfo.processInfo.processIdentifier &&
          !running.terminated) return EXIT_SUCCESS;
    }

    NSWorkspaceOpenConfiguration *configuration = [NSWorkspaceOpenConfiguration configuration];
    configuration.activates = NO;
    configuration.addsToRecentItems = NO;
    [[NSWorkspace sharedWorkspace] openApplicationAtURL:app configuration:configuration
        completionHandler:^(NSRunningApplication *application, NSError *error) {
      if (error != nil) {
        fprintf(stderr, "cafmoda-anti-sleep: %s\n", error.localizedDescription.UTF8String);
      }
      exit(application != nil && error == nil ? EXIT_SUCCESS : EXIT_FAILURE);
    }];
    [[NSRunLoop mainRunLoop] run];
    return EXIT_FAILURE;
  }
}
