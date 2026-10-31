  if (boardQuery.isError) {
    return (
      <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 rounded-xl border border-border bg-surface/30 p-6 text-center" data-testid="events-error">
        <span className="grid size-11 place-items-center rounded-xl bg-loss/10 text-loss">
          <AlertTriangle className="size-5" aria-hidden="true" />
        </span>
        <div className="max-w-sm space-y-1">
          <h2 className="text-sm font-semibold">Your calendar could not be loaded</h2>
          <p className="text-xs leading-relaxed text-muted-foreground">Euforia could not reach your saved events. No sample data has been loaded or written over your calendar.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void boardQuery.refetch()} disabled={boardQuery.isFetching}>
          <RefreshCw className={cn("size-3.5", boardQuery.isFetching && "animate-spin")} aria-hidden="true" />
          Try again
        </Button>
      </div>
    );
  }

  if (boardQuery.isPending || !hydrated) {
    return (
      <div className="grid min-h-[360px] place-items-center rounded-xl border border-border bg-surface/30" data-testid="events-loading">
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Loading your calendar…
        </div>
      </div>
    );
  }


  const displayName = profile.data?.name?.trim() || "Trader";
  const initials = displayName
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
  const displayEmail = profile.data?.email ?? "Personal calendar";

  const renderGroup = (group: CalendarGroup) => {
    const groupCalendars = calendars.filter((calendar) => calendar.group === group);
    if (groupCalendars.length === 0) return null;
    const isCollapsed = collapsed[group];
    return (
      <div key={group} data-testid={`events-group-${group}`}>
        <button
          type="button"
          onClick={() => setCollapsed((prev) => ({ ...prev, [group]: !prev[group] }))}
          aria-expanded={!isCollapsed}
          className="flex w-full items-center gap-1 rounded-md px-1 py-1 text-left text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground"
        >
          {isCollapsed ? (
            <ChevronRight className="size-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="size-3.5" aria-hidden="true" />
          )}
          {GROUP_LABELS[group]}
        </button>
        {!isCollapsed ? (
          <div className="mt-0.5 flex flex-col">
            {groupCalendars.map((calendar) => {
              const colors = EVENT_COLORS[calendar.color];
              return (
                <label
                  key={calendar.id}
                  data-testid={`events-cal-row-${calendar.id}`}
                  className="group/cal flex cursor-pointer items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/60"
                >
                  <Checkbox
                    checked={calendar.visible}
                    onCheckedChange={() => toggleVisible(calendar.id)}
                    aria-label={`Show ${calendar.name}`}
                    data-testid={`events-cal-check-${calendar.id}`}
                    className={cn("data-[state=checked]:border-transparent data-[state=checked]:text-white", colors.check)}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-foreground">{calendar.name}</span>
                  <span className={cn("size-2 shrink-0 rounded-full", colors.dot)} aria-hidden="true" />
                </label>
              );
            })}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex gap-4" data-testid="events-view">
      {/* Inner left panel - account, mini month, calendar groups (filters) */}
      {panelOpen ? (
        <aside
          data-testid="events-sidebar"
          className="hidden w-[228px] shrink-0 flex-col gap-4 rounded-xl border border-border bg-surface/50 p-3 lg:flex"
        >
          {/* Account card */}
          <div className="flex items-center gap-2.5 rounded-lg border border-border bg-background p-2" title="Account">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-md bg-foreground text-[11px] font-bold text-background"
            >
              {initials || "T"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold">{displayName}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{displayEmail}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          </div>

          {/* Mini month */}
          <div data-testid="events-mini-month">
            <div className="flex items-center justify-between px-1">
              <button
                type="button"
                aria-label="Previous month"
                data-testid="events-mini-prev"
                onClick={() => {
                  const month = viewMonth === 0 ? 11 : viewMonth - 1;
                  setViewMonth(month);
                  if (viewMonth === 0) setViewYear((year) => year - 1);
                }}
                className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="size-3.5" aria-hidden="true" />
              </button>
              <span className="text-xs font-semibold">{monthLabel(viewYear, viewMonth)}</span>
              <button
                type="button"
                aria-label="Next month"
                data-testid="events-mini-next"
                onClick={() => {
                  const month = viewMonth === 11 ? 0 : viewMonth + 1;
                  setViewMonth(month);
                  if (viewMonth === 11) setViewYear((year) => year + 1);
                }}
                className="grid size-6 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="size-3.5" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-1.5 grid grid-cols-7 text-center text-[10px] font-medium text-muted-foreground">
              {WEEKDAYS.map((day) => (
                <span key={day} className="py-0.5">
                  {day[0]}
                  {day[1]}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {cells.map((cell) => {
                const selected = cell.iso === selectedIso;
                const today = isToday(cell.iso);
                return (
                  <button
                    key={cell.iso}
                    type="button"
                    data-testid={`events-mini-day-${cell.iso}`}
                    onClick={() => {
                      setSelectedIso(cell.iso);
                      const target = dateOf(cell.iso);
                      setViewYear(target.getFullYear());
                      setViewMonth(target.getMonth());
                    }}
                    className={cn(
                      "mx-auto grid size-6 place-items-center rounded-md text-[11px] tabular-nums transition-colors",
                      cell.inMonth ? "text-foreground hover:bg-muted" : "text-muted-foreground/40 hover:bg-muted",
                      today && "bg-muted font-semibold",
                      selected && "ring-1 ring-foreground",
                    )}
                  >
                    {dayNum(cell.iso)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Calendar groups - the filter axis */}
          <div className="flex flex-col gap-2" data-testid="events-groups">
            {GROUP_ORDER.map((group) => renderGroup(group))}
          </div>

          {/* New Calendar - bottom of the panel, like the reference */}
          <div className="mt-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setNewCalOpen(true)}
              data-testid="events-new-calendar"
              className="justify-start gap-1.5 px-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="size-3.5" aria-hidden="true" />
              New Calendar
            </Button>
          </div>
        </aside>
      ) : null}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Panel toggle - same glyph family as the header collapse */}
          <button
            type="button"
            onClick={() => setPanelOpen((open) => !open)}
            aria-label={panelOpen ? "Hide calendar panel" : "Show calendar panel"}
            data-testid="events-panel-toggle"
            title={panelOpen ? "Hide panel" : "Show panel"}
            className="hidden size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground lg:grid"
          >
            {panelOpen ? (
              <PanelLeftClose className="size-4" aria-hidden="true" />
            ) : (
              <PanelLeftOpen className="size-4" aria-hidden="true" />
            )}
          </button>
          <h2 className="min-w-0 text-base font-heading font-semibold tracking-tight sm:text-lg" data-testid="events-month-label">
            {monthLabel(viewYear, viewMonth)}
          </h2>

          {/* min-w-0 + flex-wrap: on narrow screens the chips row wraps under
              the month label and scrolls horizontally instead of stretching
              the toolbar past the viewport (390px regression). */}
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            {/* Mobile filter chips (parity with the panel groups) */}
            <div className="flex max-w-full min-w-0 items-center gap-1.5 overflow-x-auto lg:hidden" data-testid="events-chips">
              {calendars.map((calendar) => (
                <button
                  key={calendar.id}
                  type="button"
                  data-testid={`events-chip-${calendar.id}`}
                  onClick={() => toggleVisible(calendar.id)}
                  aria-pressed={calendar.visible}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                    calendar.visible
                      ? "border-border bg-surface text-foreground"
                      : "border-dashed border-border text-muted-foreground/60",
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", EVENT_COLORS[calendar.color].dot)} aria-hidden="true" />
                  {calendar.name}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEvDate(selectedIso);
                setEvCalendar(calendars[0]?.id ?? "");
                setEvAllDay(false);
                setEvTime("09:00");
                setEvTitle("");
                setNewEventOpen(true);
              }}
              data-testid="events-new"
              disabled={calendars.length === 0}
              className="hidden h-8 gap-1.5 px-2.5 text-xs sm:flex"
            >
              <CalendarPlus className="size-3.5" aria-hidden="true" />
              New event
            </Button>

            {/* Sort menu - time / title / calendar */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" data-testid="events-sort" className="h-8 gap-1.5 px-2.5 text-xs">
                  <ArrowUpDown className="size-3.5" aria-hidden="true" />
                  <span className="hidden md:inline">{SORT_LABELS[sortMode]}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-40">
                {(Object.keys(SORT_LABELS) as SortMode[]).map((mode) => (
                  <DropdownMenuItem
                    key={mode}
                    data-testid={`events-sort-item-${mode}`}
                    onClick={() => setSortMode(mode)}
                    className="gap-2 text-xs"
                  >
                    {sortMode === mode ? <Check className="size-3.5" aria-hidden="true" /> : <span className="size-3.5" />}
                    {SORT_LABELS[mode]}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex items-center rounded-md border border-border">
              <button
                type="button"
                aria-label="Previous month"
                data-testid="events-prev"
                onClick={() => {
                  setViewMonth((month) => {
                    if (month === 0) {
                      setViewYear((year) => year - 1);
                      return 11;
                    }
                    return month - 1;
                  });
                }}
                className="grid size-8 place-items-center rounded-l-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                data-testid="events-today"
                onClick={() => {
                  const today = new Date();
                  setViewYear(today.getFullYear());
                  setViewMonth(today.getMonth());
                  setSelectedIso(isoOf(today));
                }}
                className="h-8 border-x border-border px-2.5 text-xs font-semibold transition-colors hover:bg-muted"
              >
                Today
              </button>
              <button
                type="button"
                aria-label="Next month"
                data-testid="events-next"
                onClick={() => {
                  setViewMonth((month) => {
                    if (month === 11) {
                      setViewYear((year) => year + 1);
                      return 0;
                    }
                    return month + 1;
                  });
                }}
                className="grid size-8 place-items-center rounded-r-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>

        {calendars.length === 0 ? (
          <section className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-surface/30 px-6 py-8 text-center" data-testid="events-empty-state">
            <span className="grid size-11 place-items-center rounded-xl border border-border bg-background text-muted-foreground">
              <CalendarPlus className="size-5" aria-hidden="true" />
            </span>
            <div className="max-w-sm space-y-1">
              <h3 className="text-sm font-semibold">Your calendar starts here</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">Create a calendar for trading sessions, personal reminders and important dates. Only events you add will appear here.</p>
            </div>
            <Button size="sm" onClick={() => setNewCalOpen(true)} data-testid="events-empty-create-calendar">
              <Plus className="size-3.5" aria-hidden="true" />
              Create calendar
            </Button>
          </section>
        ) : null}

        {/* Month grid */}
        <div className="overflow-hidden rounded-xl border border-border" data-testid="events-grid">
          <div className="grid grid-cols-7 border-b border-border bg-surface/60">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="px-1.5 py-1.5 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground sm:px-2 sm:text-left"
              >
                <span className="hidden sm:inline">{day}</span>
                <span className="sm:hidden">{day[0]}</span>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-px bg-border">
            {cells.map((cell) => {
              const dayEvents = sortEvents(eventsByDate.get(cell.iso) ?? [], sortMode, calendarName);
              const today = isToday(cell.iso);
              const selected = cell.iso === selectedIso;
              const isDropTarget = drag !== null && drag.overIso === cell.iso;
              return (
                <div
                  key={cell.iso}
                  ref={(el) => {
                    if (el) cellRefs.current.set(cell.iso, el);
                    else cellRefs.current.delete(cell.iso);
                  }}
                  data-testid={`events-cell-${cell.iso}`}
                  data-events-cell={cell.iso}
                  onClick={() => setSelectedIso(cell.iso)}
                  className={cn(
                    "min-h-[76px] cursor-pointer bg-background p-1 transition-colors sm:min-h-[104px] lg:min-h-[116px]",
                    !cell.inMonth && "bg-muted/20",
                    today && "bg-accent/[0.05]",
                    selected && "ring-1 ring-inset ring-accent",
                    isDropTarget && "bg-accent/10",
                  )}
                >
                  <div className="flex items-start justify-start px-0.5">
                    <span
                      className={cn(
                        "grid size-5 place-items-center rounded-full text-[11px] tabular-nums sm:size-6 sm:text-xs",
                        cell.inMonth ? "text-foreground" : "text-muted-foreground/40",
                        today && "bg-foreground font-semibold text-background",
                      )}
                    >
                      {dayNum(cell.iso)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-col gap-1">
                    {dayEvents.map((item) => {
                      const colors = EVENT_COLORS[calendarById.get(item.calendarId)?.color ?? "blue"];
                      const isDragged = drag?.eventId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          data-testid={`events-pill-${item.id}`}
                          data-events-pill={item.id}
                          onPointerDown={(event) => onPillPointerDown(event, item.id)}
                          title={`${item.allDay ? "" : `${item.time} `}${item.title} · ${calendarName(item.calendarId)}`}
                          style={{ touchAction: "none" }}
                          className={cn(
                            "flex w-full items-center gap-1 truncate rounded-sm border-l-2 px-1 py-0.5 text-left text-[10px] font-medium leading-tight sm:text-[11px]",
                            colors.pill,
                            isDragged && "opacity-30",
                          )}
                        >
                          {item.favorite ? <Star className="size-2.5 shrink-0 fill-current" aria-hidden="true" /> : null}
                          {!item.allDay ? (
                            <span className="shrink-0 font-mono text-[9px] font-semibold opacity-80 sm:text-[10px]">
                              {item.time}
                            </span>
                          ) : null}
                          <span className="truncate">{item.title}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Event details card - appears where the pill was tapped/clicked */}
      {details && detailsEvent ? (
        <>
          <button
            type="button"
            aria-label="Close details"
            className="fixed inset-0 z-[65] cursor-default"
            onClick={() => setDetails(null)}
            data-testid="events-details-backdrop"
          />
          <div
            data-testid="events-details"
            className="fixed z-[70] w-60 rounded-xl border border-border bg-surface p-3 shadow-2xl"
            style={{
              left: Math.min(Math.max(details.x - 120, 12), (typeof window !== "undefined" ? window.innerWidth : 800) - 252),
              top: Math.min(details.y + 10, (typeof window !== "undefined" ? window.innerHeight : 600) - 220),
            }}
          >
            {details.renaming ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  renameEvent(detailsEvent.id);
                }}
                className="flex items-center gap-1.5"
              >
                <Input
                  autoFocus
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  aria-label="Event title"
                  data-testid="events-details-rename-input"
                  className="h-7 bg-background text-xs"
                  maxLength={80}
                />
                <Button type="submit" size="icon" className="size-7 shrink-0" aria-label="Save title" data-testid="events-details-rename-save">
                  <Check className="size-3.5" aria-hidden="true" />
                </Button>
              </form>
            ) : (
              <div className="flex items-start gap-2">
                <span
                  className={cn("mt-1 size-2 shrink-0 rounded-full", EVENT_COLORS[calendarById.get(detailsEvent.calendarId)?.color ?? "blue"].dot)}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{detailsEvent.title}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {calendarName(detailsEvent.calendarId)} ·{" "}
                    {dateOf(detailsEvent.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {detailsEvent.allDay ? "" : ` · ${detailsEvent.time}`}
                  </p>
                </div>
              </div>
            )}
            <div className="mt-2.5 flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => toggleFavorite(detailsEvent.id)}
                data-testid="events-details-star"
                className={cn("h-7 gap-1 px-2 text-xs", detailsEvent.favorite && "text-warning")}
              >
                <Star className={cn("size-3.5", detailsEvent.favorite && "fill-current")} aria-hidden="true" />
                {detailsEvent.favorite ? "Starred" : "Star"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRenameValue(detailsEvent.title);
                  setDetails({ ...details, renaming: true });
                }}
                data-testid="events-details-rename"
                className="h-7 gap-1 px-2 text-xs"
              >
                <Pencil className="size-3.5" aria-hidden="true" />
                Rename
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteEvent(detailsEvent.id)}
                data-testid="events-details-delete"
                className="ml-auto h-7 gap-1 px-2 text-xs text-muted-foreground hover:bg-loss/10 hover:text-loss"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
                Delete
              </Button>
            </div>
          </div>
        </>
      ) : null}

      {/* Drag ghost for events */}
      {drag && dragEvent && dragColors ? (
        <div
          aria-hidden="true"
          data-testid="events-drag-ghost"
          className="pointer-events-none fixed z-[80] rotate-1 opacity-95"
          style={{ left: drag.x - drag.grabX, top: drag.y - drag.grabY }}
        >
          <div className={cn("w-44 truncate rounded-sm border-l-2 px-1.5 py-0.5 text-[11px] font-medium shadow-2xl", dragColors.pill)}>
            {dragEvent.allDay ? "" : `${dragEvent.time} `}
            {dragEvent.title}
          </div>
        </div>
      ) : null}
      {drag ? <div className="fixed inset-0 z-[75] cursor-grabbing" aria-hidden="true" data-testid="events-drag-veil" /> : null}

      {/* New event dialog */}
      <Dialog open={newEventOpen} onOpenChange={setNewEventOpen}>
        <DialogContent className="sm:max-w-md" data-testid="events-new-dialog">
          <DialogHeader>
            <DialogTitle>New event</DialogTitle>
            <DialogDescription>Add an event to one of your calendars.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="events-new-title" className="text-xs font-medium text-muted-foreground">
                Title
              </label>
              <Input
                id="events-new-title"
                value={evTitle}
                onChange={(event) => setEvTitle(event.target.value)}
                placeholder="Event title…"
                data-testid="events-new-title"
                maxLength={80}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Calendar</span>
                <Select value={evCalendar} onValueChange={setEvCalendar}>
                  <SelectTrigger data-testid="events-new-calendar-select" aria-label="Calendar">
                    <SelectValue placeholder="Pick a calendar" />
                  </SelectTrigger>
                  <SelectContent>
                    {calendars.map((calendar) => (
                      <SelectItem key={calendar.id} value={calendar.id} data-testid={`events-new-cal-${calendar.id}`}>
                        <span className="flex items-center gap-2">
                          <span className={cn("size-2 rounded-full", EVENT_COLORS[calendar.color].dot)} aria-hidden="true" />
                          {calendar.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Date</span>
                <Input
                  type="date"
                  value={evDate}
                  onChange={(event) => setEvDate(event.target.value)}
                  data-testid="events-new-date"
                />
              </div>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium">
                <Checkbox
                  checked={evAllDay}
                  onCheckedChange={(checked) => setEvAllDay(checked === true)}
                  data-testid="events-new-allday"
                  aria-label="All day"
                />
                All day
              </label>
              {!evAllDay ? (
                <Input
                  type="time"
                  value={evTime}
                  onChange={(event) => setEvTime(event.target.value)}
                  data-testid="events-new-time"
                  aria-label="Time"
                  className="h-9 w-28"
                />
              ) : null}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setNewEventOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={createEvent} disabled={evTitle.trim() === "" || evCalendar === ""} data-testid="events-new-create">
              Create event
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New calendar dialog */}
      <Dialog open={newCalOpen} onOpenChange={setNewCalOpen}>
        <DialogContent className="sm:max-w-md" data-testid="events-newcal-dialog">
          <DialogHeader>
            <DialogTitle>New Calendar</DialogTitle>
            <DialogDescription>Name it, pick a color and choose its group.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="events-newcal-name" className="text-xs font-medium text-muted-foreground">
                Name
              </label>
              <Input
                id="events-newcal-name"
                value={calName}
                onChange={(event) => setCalName(event.target.value)}
                placeholder="Calendar name…"
                data-testid="events-newcal-name"
                maxLength={40}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Color</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Calendar color">
                {COLOR_KEYS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    role="radio"
                    aria-checked={calColor === color}
                    data-testid={`events-newcal-color-${color}`}
                    onClick={() => setCalColor(color)}
                    className={cn(
                      "size-6 rounded-full transition-transform",
                      EVENT_COLORS[color].dot,
                      calColor === color ? "scale-110 ring-2 ring-foreground ring-offset-2 ring-offset-background" : "opacity-70 hover:opacity-100",
                    )}
                    aria-label={color}
                  />
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">Group</span>
              <Select value={calGroup} onValueChange={(value) => setCalGroup(value as CalendarGroup)}>
                <SelectTrigger data-testid="events-newcal-group" aria-label="Group">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GROUP_ORDER.map((group) => (
                    <SelectItem key={group} value={group}>
                      {GROUP_LABELS[group]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={() => setNewCalOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={createCalendar} disabled={calName.trim() === ""} data-testid="events-newcal-create">
              Create calendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
