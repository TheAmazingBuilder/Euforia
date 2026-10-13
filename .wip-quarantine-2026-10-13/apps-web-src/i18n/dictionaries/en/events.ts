import type { Dictionary } from "@/i18n/dictionaries/en";

/**
 * EN dictionary — EVENTS namespace (canonical). The independent personal
 * calendar: sidebar groups, month grid, event editor and the New Calendar
 * modal. Static strings — components compose dynamic parts themselves.
 */

export type EventsDict = Dictionary["events"];

export const eventsDict = {
  sidebar: {
    calendarsAria: "Calendar groups",
    myCalendars: "My Calendars",
    favorites: "Favorites",
    other: "Other",
    newCalendar: "New Calendar",
    collapse: "Toggle calendar panel",
    emptyFavorites: "Star a calendar to pin it here.",
    star: "Add to favorites",
    unstar: "Remove from favorites",
    deleteCalendar: "Delete calendar",
  },
  mini: {
    prev: "Previous month",
    next: "Next month",
    weekdays: ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"] as readonly string[],
  },
  toolbar: {
    today: "Today",
    prev: "Previous month",
    next: "Next month",
    sort: "Sort events",
    sortTime: "Time",
    sortTimeDesc: "Latest first",
    sortCalendar: "Calendar",
    sortTitle: "Title",
  },
  grid: {
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as readonly string[],
    moreSuffix: "more",
    moreAria: "More events",
    todayAria: "Today",
  },
  eventDialog: {
    createTitle: "New event",
    editTitle: "Edit event",
    titleLabel: "Title",
    titlePlaceholder: "e.g. Review session",
    calendar: "Calendar",
    date: "Date",
    endDate: "End date",
    endDateHint: "For multi-day events",
    allDay: "All day",
    startTime: "Start",
    endTime: "End",
    location: "Location",
    locationPlaceholder: "Optional",
    notes: "Notes",
    notesPlaceholder: "Optional context — agenda, checklist…",
    save: "Save event",
    creating: "Creating…",
    delete: "Delete event",
    deleteTitle: "Delete this event?",
    deleteBody: "This event will be removed from the calendar.",
    cancel: "Cancel",
  },
  calendarDialog: {
    title: "New Calendar",
    nameLabel: "Name",
    namePlaceholder: "e.g. Prop-firm challenges",
    color: "Color",
    group: "Group",
    groupMy: "My Calendars",
    groupFavorites: "Favorites",
    groupOther: "Other",
    create: "Create",
    creating: "Creating…",
  },
  deleteCalendarDialog: {
    title: "Delete this calendar?",
    body: "This removes the calendar and every event it owns. This cannot be undone.",
    confirm: "Delete calendar",
  },
} as const;
