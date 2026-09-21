// Shared chrome for dropdown menus. The chest-GUI panel used everywhere else is #c6c6c6, which
// white text is unreadable on, so a dropdown gets its own OPAQUE dark surface instead - opaque
// rather than a tint, since a menu floats over gear tiles and a target-mob render.
//
// Shared by the potion menu on Landing and the class picker on Damage Sources: the two are the
// same control to a reader, and two copies of this string would drift.
export const dropdownPanel =
  'bg-[#2f2f2f] border-[3px] border-t-[#5e5e5e] border-l-[#5e5e5e] border-b-[#151515] border-r-[#151515] outline outline-2 outline-black';

// The matching option/row colours. `dropdownOptionBg` also goes on each <option> of a native
// <select>: the OS popup takes its colours from the options themselves, not the closed control.
export const dropdownOptionBg = 'bg-[#2f2f2f]';
export const dropdownItem = 'text-white';
export const dropdownItemMuted = 'text-white/80';
export const dropdownItemActive = 'bg-white/20 text-white';
