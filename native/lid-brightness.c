#include <CoreGraphics/CoreGraphics.h>
#include <IOKit/IOKitLib.h>
#include <dispatch/dispatch.h>
#include <dlfcn.h>
#include <math.h>

typedef int (*GetBrightness)(CGDirectDisplayID, float *);
typedef int (*SetBrightness)(CGDirectDisplayID, float);
static GetBrightness getBrightness;
static SetBrightness setBrightness;

int cafmoda_brightness_available(void) {
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    // DisplayServices works on Apple Silicon, where the older IODisplay
    // brightness API does not. Keep the framework mapped for these pointers.
    void *framework = dlopen(
        "/System/Library/PrivateFrameworks/DisplayServices.framework/DisplayServices",
        RTLD_LAZY | RTLD_LOCAL);
    if (framework != NULL) {
      getBrightness = (GetBrightness)dlsym(framework, "DisplayServicesGetBrightness");
      setBrightness = (SetBrightness)dlsym(framework, "DisplayServicesSetBrightness");
    }
  });
  return getBrightness != NULL && setBrightness != NULL;
}

// -1 means unknown: a missing lid property must never be treated as open.
int cafmoda_lid_closed(void) {
  io_service_t root = IOServiceGetMatchingService(kIOMainPortDefault,
      IOServiceMatching("IOPMrootDomain"));
  if (root == IO_OBJECT_NULL) return -1;
  CFTypeRef value = IORegistryEntryCreateCFProperty(root,
      CFSTR("AppleClamshellState"), kCFAllocatorDefault, 0);
  IOObjectRelease(root);
  int closed = -1;
  if (value != NULL) {
    if (CFGetTypeID(value) == CFBooleanGetTypeID()) {
      closed = CFBooleanGetValue((CFBooleanRef)value) ? 1 : 0;
    }
    CFRelease(value);
  }
  return closed;
}

uint32_t cafmoda_builtin_display(void) {
  CGDirectDisplayID displays[32];
  uint32_t count = 0;
  if (CGGetOnlineDisplayList(32, displays, &count) != kCGErrorSuccess) return 0;
  for (uint32_t i = 0; i < count; i++) {
    if (CGDisplayIsBuiltin(displays[i])) return displays[i];
  }
  // Never substitute the main display: that might be an external monitor.
  return 0;
}

int cafmoda_get_brightness(uint32_t display, float *value) {
  return cafmoda_brightness_available() && display != 0 &&
      getBrightness(display, value) == 0 && isfinite(*value) &&
      *value >= 0 && *value <= 1;
}

int cafmoda_set_brightness(uint32_t display, float value) {
  return cafmoda_brightness_available() && display != 0 &&
      isfinite(value) && value >= 0 && value <= 1 &&
      setBrightness(display, value) == 0;
}
