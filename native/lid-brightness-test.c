#include "lid-brightness.c"
#include <assert.h>
#include <stdio.h>

int main(void) {
  int lid = cafmoda_lid_closed();
  assert(lid >= -1 && lid <= 1);
  assert(cafmoda_brightness_available() == 1);
  float brightness = -1;
  assert(cafmoda_get_brightness(0, &brightness) == 0);
  assert(cafmoda_set_brightness(0, 0) == 0);
  uint32_t display = cafmoda_builtin_display();
  if (display != 0) {
    assert(CGDisplayIsBuiltin(display));
    assert(cafmoda_get_brightness(display, &brightness) == 1);
    assert(cafmoda_set_brightness(display, NAN) == 0);
    assert(cafmoda_set_brightness(display, -1) == 0);
    assert(cafmoda_set_brightness(display, 2) == 0);
    // Exercise the real write API without changing the user's brightness.
    assert(cafmoda_set_brightness(display, brightness) == 1);
    printf("Native brightness API passed: lid=%d, built-in display=%u, brightness=%.3f\n",
        lid, display, brightness);
  } else {
    puts("Native brightness API loaded; no online built-in display to exercise");
  }
  return 0;
}
