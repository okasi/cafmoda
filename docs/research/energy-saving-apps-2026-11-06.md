# Energy-saving features in apps comparable to Cafmoda

Research date: 6 November 2026. Scope: macOS keep-awake utilities and adjacent
energy-management apps, with recommendations for Cafmoda.

This is a documentation and source review, not a hands-on benchmark. Features
below are supported by developer sites, developer-authored App Store
descriptions, release notes, repositories, or Apple documentation. “Not
established” means the reviewed evidence does not settle the point; it does not
mean a feature is absent. Recommendations and proposed defaults are my judgment,
not measured results. Prices, when included, are advertised prices and may vary
by region or tax.

The main opportunity is to keep the Mac awake for useful work, then reliably
return control to macOS. Automatic stopping, independent display sleep, and
restoration of previous settings fit Cafmoda particularly well. CPU management,
sleep diagnostics, and charge limiting solve related but different problems.

**The comparison**

| App                                                                                                  | Documented energy-related behavior                                                                                 | Main lesson for Cafmoda                                               |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| [Amphetamine](https://apps.apple.com/us/app/amphetamine/id937984704?mt=12)                           | Low-battery session ending; independent display sleep; timed, app, download, and power-dependent sessions.         | General-purpose sessions should have explicit stop conditions.        |
| [KeepingYouAwake](https://keepingyouawake.app/)                                                      | Battery-level cutoff and predefined durations; additional battery and display options in its release notes.        | Useful protection can fit a small utility.                            |
| [Lungo](https://sindresorhus.com/lungo)                                                              | Optional deactivation on battery, display sleep, and sleep while locked.                                           | Offer a few clear policies with automation available separately.      |
| [Caffeinated, by Yugen](https://apps.apple.com/us/app/caffeinated-anti-sleep-app/id1362171212?mt=12) | Charger-disconnection deactivation, durations, display-sleep setting.                                              | Remembered durations and power changes are practical controls.        |
| [Caffeinator, by zazaulola](https://github.com/zazaulola/Caffeinator)                                | Stops at 10% or below on battery; timers; watches a selected process.                                              | Explain why a session stopped and use power notifications.            |
| [Let It Brew](https://letitbrew.app/)                                                                | Agent-activity sessions, battery floor, connected-power-only operation, Low Power Mode, independent display sleep. | Link the awake hold to actual work.                                   |
| [Agent Caffeine](https://caffeinagent.com/)                                                          | Agent-activity sessions; waiting grace period; battery and heat release; command-scoped holds.                     | Distinguish working, waiting, and idle.                               |
| [App Tamer](https://www.stclairsoft.com/AppTamer/)                                                   | Slows or pauses background apps; CPU limits; Apple silicon efficiency-core control.                                | Reducing background activity is a separate product capability.        |
| [Endurance, by Magnetism Studios](https://enduranceapp.com/)                                         | Battery-triggered dimming and app management; advertises disabling processor Turbo.                                | A power-saving preset can combine optional actions.                   |
| [Sleep Aid](https://ohanaware.com/sleepaid/)                                                         | Sleep-blocker diagnostics and history; optional Wi-Fi/Bluetooth changes during sleep.                              | Explain why normal sleep is still blocked.                            |
| [AlDente](https://apphousekitchen.com/aldente-overview/)                                             | Charge limits; paid heat protection, charge ranges, and battery statistics.                                        | Long-term battery care is distinct from energy saved today.           |
| [BatFi](https://micropixels.software/batfi/)                                                         | Charge limits and automation; energy readouts; power-mode shortcuts.                                               | Clear state explanations and temporary overrides are useful patterns. |

**The most relevant keep-awake products**

Amphetamine is the broadest general-purpose reference in this review. It is free
and documents sessions lasting until a deadline, while an app runs, or while a
file downloads. Its triggers include power source, battery conditions, CPU
utilization, and peripherals. It can allow the display to sleep and end sessions
when the battery is low. Closed-display behavior has additional Apple silicon
scripts and power-transition caveats in its release history. Treat its
closed-lid support as a separate capability with extra integration work. Do not
copy the complexity of every trigger before simpler sessions work reliably.
[Developer listing and release history](https://apps.apple.com/us/app/amphetamine/id937984704?mt=12).

KeepingYouAwake is a useful small, open-source reference. Its site documents
durations and low-battery deactivation; its repository identifies it as a
wrapper around Apple's `caffeinate` and explicitly excludes ordinary closed-lid
operation. Its changelog records display-sleep support and Low Power Mode-aware
battery preferences, with the latter introduced in 1.6.3. That makes it a
particularly close reference for Cafmoda's ordinary awake mode.
[Product](https://keepingyouawake.app/),
[repository](https://github.com/newmarcel/KeepingYouAwake),
[changelog](https://github.com/newmarcel/KeepingYouAwake/blob/main/CHANGELOG.md).

Lungo offers a smaller policy set: fixed durations, optional stopping when
switching to battery, letting the display sleep, and allowing sleep while
locked. Shortcuts provide additional automation without a built-in rule editor.
The live site advertises a $4 one-time purchase and macOS 26 for its current
version, with older versions available. Its FAQ describes the
charger-plus-external-display exception for closed-lid use and says scheduled
sleep takes priority. This is a good reference for keeping Cafmoda's first menu
understandable. [Developer site](https://sindresorhus.com/lungo).

Caffeinated here means Yugen's app; several unrelated apps use similar names.
Its developer-authored release history documents deactivation when disconnecting
the charger, saved default durations, an option to allow display sleep, and
Shortcuts/AppleScript integration. Those are concrete, achievable improvements
for Cafmoda. A battery-percentage cutoff and thermal release were not
established by the reviewed materials.
[Developer listing](https://apps.apple.com/us/app/caffeinated-anti-sleep-app/id1362171212?mt=12),
[product site](https://caffeinated.app/).

Caffeinator is a smaller open-source implementation reference. Its README
describes a fixed guard at 10% or below while on battery, which disables
activation until power conditions improve. It also describes timers,
process-exit sessions, a reason-bearing status line, and IOKit power-source
notifications. Those implementation choices are directly relevant. A selected
process merely remaining alive is still weaker evidence of useful work than a
task lifecycle. The repository documents its behavior; this review did not
validate the running app or its reliability.
[Repository and implementation overview](https://github.com/zazaulola/Caffeinator).

**Task-aware apps are the most interesting newer direction**

Let It Brew follows local coding-agent activity. Its site documents
connected-power-only operation, a battery floor, Low Power Mode, and independent
display sleep. Its repository adds an important limitation: some approval waits,
including Codex and Cursor approvals, continue holding the Mac awake because the
available signals do not reliably distinguish them. Agent integration therefore
needs explicit contracts and tested edge cases rather than assuming every open
agent is working. [Product](https://letitbrew.app/),
[repository](https://github.com/ruban-24/letitbrew).

Its architecture is especially relevant to Modafinilate. It documents ordinary
process-owned assertions for open-lid work and a privileged service for its
closed-lid behavior. Before changing persistent settings, the service records
exact previous values and reconciles them after crashes or restarts. Low Power
Mode has its own restoration record. These are documented design choices, not
independently verified guarantees. The transferable idea is to make every
persistent change recoverable. Cafmoda need not reproduce its full
agent-integration architecture to adopt that principle.
[Architecture and recovery design](https://github.com/ruban-24/letitbrew/blob/main/docs/ARCHITECTURE.md).

Agent Caffeine documents a configurable five-minute grace period while an agent
waits for input, release at 20% battery or excessive heat, and holds scoped to
long-running commands. The live page now advertises a seven-day trial followed
by a paid license; an older search excerpt still described it as free. Use the
live page for current terms. Its value for Cafmoda is the distinction between
working, temporarily waiting, and finished. Exact integration reliability and
hardware behavior remain untested here.
[Live developer site](https://caffeinagent.com/).

For Cafmoda, begin with “until this command finishes” or “until this process
exits.” Then consider explicit start/finish hooks for agents. An editor,
Terminal, or browser can stay open all day after a task ends, so application
presence alone should not be presented as task completion detection.

**Adjacent products: ideas worth borrowing selectively**

App Tamer directly manages other processes. It documents pausing or slowing
background apps and using efficiency cores on Apple silicon. Its manual also
documents battery-dependent control and explains that fully paused apps cannot
perform background synchronization. That tradeoff matters for downloads, calls,
and messages. Its 3.0 beta adds profiles and activation rules; those should not
be described as established stable-version capabilities. It is useful
inspiration for a later opt-in module, but implementing process control would
substantially expand Cafmoda's responsibility.
[Product](https://www.stclairsoft.com/AppTamer/),
[process behavior](https://www.stclairsoft.com/AppTamer/help/pages/managing.html),
[power preferences](https://www.stclairsoft.com/AppTamer/help/pages/preferences.html),
[3.0 beta](https://www.stclairsoft.com/AppTamer/beta.html).

Endurance combines automatic battery-triggered activation, gradual screen
dimming, background-app management, and a processor Turbo switch. Its site
advertises $20 and roughly 20% extra runtime from its own tests. That is a
vendor claim, not an expected result for Cafmoda or the user's Mac. The reviewed
page does not establish which modules work on current Apple silicon systems; its
Turbo feature should not be treated as an Apple silicon implementation recipe.
It is primarily a reference for an optional, modular power-saving preset.
[Developer site](https://enduranceapp.com/).

Sleep Aid focuses on wasted energy when a Mac should be asleep. It documents a
sleep-history view, current sleep blockers, and optional changes such as
disabling Wi-Fi or Bluetooth during sleep. Its page lists compatibility through
macOS 15, so newer-system compatibility is not established here. Cafmoda could
borrow a read-only “Why is my Mac awake?” view first. Radio changes would need
explicit user control because they affect connectivity.
[Developer site](https://ohanaware.com/sleepaid/).

AlDente focuses on battery longevity. It offers a free charge limiter and
discharge control, plus paid heat protection, charge ranges, and statistics. Its
charging-temperature protection is different from ending an awake session
because the whole system is thermally stressed. Cafmoda could borrow the
presentation of temporary overrides and restoration, while leaving charge
management to dedicated tools or macOS.
[Developer overview](https://apphousekitchen.com/aldente-overview/).

BatFi also manages charge limits, adding time/place rules, energy readouts, and
power-mode shortcuts. Its current page advertises $15 and Apple silicon support.
It documents version-dependent restrictions on its heat-related charging
feature. Its useful UX patterns are showing the active rule, explaining state
changes, and making a temporary full-charge override easy. Charge limiting
itself remains a different objective from reducing the electricity consumed by a
keep-awake session. [Developer site](https://micropixels.software/batfi/).

**What macOS already provides**

Apple documents Low Power Mode, independent battery/adapter energy modes,
display dimming, automatic sleep while the display is off, and charging controls
on supported systems. Availability varies by model and OS. Cafmoda can add value
by making session-specific choices easier and reversible, while using the
system's capabilities. A dedicated charge limiter needs to justify its value
beyond current native charging controls.
[Battery settings](https://support.apple.com/guide/mac-help/change-battery-settings-mchlfc3b7879/mac),
[Power Modes](https://support.apple.com/en-ie/101613).

There are four different outcomes to keep separate in the UI: less energy used
while working; less unnecessary time awake; less drain during sleep; and slower
battery aging. A feature that improves one does not prove it improves the
others. For example, preserving battery health with an 80% charge limit does not
give the user a longer current charge than charging to full.

**Cafmoda's current baseline**

These findings describe the v0.2.0 baseline before the power-policy changes, not
an energy benchmark. Source links point to that historical version:

- The display mode starts `caffeinate -d`. There is no ordinary, session-scoped
  “keep working, let the screen sleep” mode.
  [main.ts](https://github.com/okasi/cafmoda/blob/7220d91eb9682e0ac49c41b5bea5e7c2958b7949/main.ts#L120).
- Modafinilate writes persistent sleep settings. Turning it off writes a
  five-minute battery sleep timer and enables sleep instead of restoring the
  exact previous values. Normal quit does not revert Modafinilate.
  [settings](https://github.com/okasi/cafmoda/blob/7220d91eb9682e0ac49c41b5bea5e7c2958b7949/main.ts#L34),
  [quit](https://github.com/okasi/cafmoda/blob/7220d91eb9682e0ac49c41b5bea5e7c2958b7949/main.ts#L352).
- The state model contains no battery level, power source, session deadline, or
  Low Power Mode state.
  [State](https://github.com/okasi/cafmoda/blob/7220d91eb9682e0ac49c41b5bea5e7c2958b7949/main.ts#L198).
- Status refresh runs every two seconds and invokes command-line queries. Lid
  brightness is polled every 500 ms. These are optimization candidates; the code
  alone does not quantify their energy cost.
  [status polling](https://github.com/okasi/cafmoda/blob/7220d91eb9682e0ac49c41b5bea5e7c2958b7949/main.ts#L380),
  [lid polling](https://github.com/okasi/cafmoda/blob/7220d91eb9682e0ac49c41b5bea5e7c2958b7949/lid-brightness.ts#L116).
- Display dimming on lid close already exists. Minimum brightness should not be
  described as verified display power-off, and the README explicitly says
  closed-lid operation is unverified.
  [README](https://github.com/okasi/cafmoda/blob/7220d91eb9682e0ac49c41b5bea5e7c2958b7949/README.md).
- The off action uses pattern-based termination of matching `caffeinate -d`
  processes, including ones outside Cafmoda. Automatic stopping should target
  Cafmoda's own hold.
  [process handling](https://github.com/okasi/cafmoda/blob/7220d91eb9682e0ac49c41b5bea5e7c2958b7949/main.ts#L123).

**Recommended feature order**

| Priority | Proposed change                                            | Why it comes here                                                                   |
| -------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| First    | Exact restoration and recovery for persistent changes      | Every new automatic stopping rule depends on actually releasing Cafmoda's effects.  |
| First    | Timed sessions: 15 min, 30 min, 1 h, 2 h, custom           | Clear stop conditions with modest UI and implementation scope.                      |
| First    | On-battery cutoff, proposed default 20%, configurable      | Common competitor protection; 20% is a product choice, not a proven optimum.        |
| First    | Ordinary “keep Mac awake, allow screen sleep” session      | Fits builds and downloads without persistent sleep-setting changes.                 |
| Next     | Stop when unplugged; respect user-enabled Low Power Mode   | Gives users predictable policies for battery use.                                   |
| Next     | Command/process completion sessions                        | Ends holds when a specific job ends.                                                |
| Next     | Optional Low Power Mode during a session, with restoration | Potentially useful for unattended work, subject to capability and workload testing. |
| Next     | Thermal-state release for closed-lid sessions              | Relevant protection as that capability is developed and verified.                   |
| Later    | Agent lifecycle integrations and sleep-blocker diagnostics | More capable, but more integration and interpretation work.                         |
| Defer    | CPU throttling, charge control, radio changes              | Broad scope and interactions beyond the core keep-awake purpose.                    |

A proposed compact menu could offer “Keep Mac Awake” with “Allow display sleep”
or “Keep display on,” a duration selector, and a separate closed-lid option. A
status line should explain the actual state: “Awake for 24 more minutes,”
“Stopped at 20% battery,” or “Cafmoda released its hold; another app prevents
sleep.” Avoid saying the Mac is asleep merely because Cafmoda stopped preventing
sleep.

Stopping because of a deadline, battery limit, or unplugging should end that
session by default. Reconnecting the charger should not silently resume a
manually ended session. If automatic resumption is offered, make it an explicit
rule. For multiple simultaneous tasks, release the shared hold only after the
last relevant task finishes; battery and thermal policies still take precedence.

**Implementation direction**

Use a small session policy layer with inputs for requested mode, deadline, work
state, power source, battery, Low Power Mode, and thermal state. Its output
should include whether to hold system sleep, whether to hold display sleep, and
a human-readable reason. Keep deciding policy separate from applying native
changes so it can be verified without altering the machine's actual power
settings.

Apple exposes power-source notifications through
`IOPSNotificationCreateRunLoopSource` and Low Power Mode state through
`ProcessInfo`. These can support battery and unplugging rules without adding
another rapid polling loop. The Low Power Mode property is a read-only
observation API; it is not an API for changing the system setting.
[Power-source API](https://developer.apple.com/documentation/iokit/iopowersources_h),
[Low Power Mode observation](https://developer.apple.com/documentation/foundation/processinfo/islowpowermodeenabled).

For ordinary idle-sleep prevention, use owned `caffeinate` processes or IOKit
assertions. Apple's `caffeinate` source supports display and system-idle
assertions, timeouts, process-exit watching, and command-scoped execution. Those
mechanisms do not establish closed-lid behavior. Bind any child helper to its
owner or otherwise ensure an app crash cannot leave an orphaned hold. Prefer a
process handle over a broad name-based kill.
[Apple's implementation](https://github.com/apple-oss-distributions/PowerManagement/blob/main/caffeinate/caffeinate.c),
[assertion API](https://developer.apple.com/documentation/iokit/1557134-iopmassertioncreatewithname).

Persistent settings require a separate lifecycle: record the exact baseline
before writing; confirm each write; roll back partial failure; restore on
release; retain recovery information if restoration fails; reconcile after
restart. If another app or user changes a setting in the meantime, detect the
ownership conflict rather than blindly overwriting it. A normal quit handler
alone cannot cover a crash or forced termination. This is particularly relevant
to Modafinilate and any future system-wide power-mode changes.

Apple's energy guidance recommends responding to events, minimizing timer use,
and remaining idle when no work is required. Review Cafmoda's existing polling
before adding monitors, while retaining whatever fallback is necessary for
external state changes. This is an engineering direction, not evidence that
polling currently dominates Cafmoda's energy use.
[Current CPU-scheduling guidance](https://developer.apple.com/documentation/xcode/scheduling-cpu-work-efficiently),
[Mac timer guidance](https://developer.apple.com/library/archive/documentation/Performance/Conceptual/power_efficiency_guidelines_osx/Timers.html).

**How to verify actual savings**

Measure two things separately: the utility's overhead when inactive, and
whole-system energy consumed for a representative task. Holding the screen off
may reduce power while a slower task takes longer, so compare energy to
completion as well as average watts.

Use repeated comparable runs on the same Mac, with stable brightness, radios,
peripherals, battery range, OS, and workload. Record task completion time, total
energy where supported, CPU time, idle wakeups, display state, and whether the
system actually sleeps after work. Test inactive Cafmoda, current behavior, the
proposed screen-off mode, and that mode with Low Power Mode. Include an
overnight or prolonged idle case to catch forgotten holds.

Activity Monitor's Energy Impact is a relative indicator, not watts or
watt-hours. Use it to identify regressions and corroborate other measurements;
do not convert it into a claimed amount of energy or CO₂ saved. Likewise,
battery percentage changes alone are a coarse measure.
[Apple's Activity Monitor guide](https://support.apple.com/guide/activity-monitor/view-energy-consumption-actmntr43697/mac).

Behavioral verification should cover battery thresholds while plugged in versus
discharging, missing battery readings, charger changes, deadlines across
sleep/wake, process exits, crashes, partial settings failures, and external
changes to the same settings. Any closed-lid work needs hardware tests across
the supported Mac/OS combinations, including external-display and power
transitions. Competitor descriptions cannot substitute for that validation.

The clearest product direction is a small utility that makes it easy to keep
useful work running with a sleeping display and an explicit end condition. Exact
restoration makes that behavior dependable; battery and thermal policies bound
it; task awareness can then make it automatic.
