"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, LocateFixed } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type DatePickerProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
};

function parseDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function dateKey(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
}

function formatDateLabel(value: string, placeholder: string): string {
  const date = parseDateKey(value);
  return date
    ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date)
    : placeholder;
}

export function DatePicker({
  value,
  onChange,
  placeholder = "dd/mm/yyyy",
  ariaLabel = "Choose date",
  id,
  disabled = false,
  className,
  "data-testid": testId,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const selectedDate = parseDateKey(value);
  const [visibleMonth, setVisibleMonth] = React.useState(() => {
    const initial = selectedDate ?? new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const calendarStart = new Date(year, month, 1 - mondayOffset);
  const days = Array.from({ length: 42 }, (_, index) =>
    new Date(calendarStart.getFullYear(), calendarStart.getMonth(), calendarStart.getDate() + index),
  );
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(2024, 0, 1 + index)),
  );

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen && selectedDate !== null) {
          setVisibleMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          aria-label={ariaLabel}
          id={id}
          data-testid={testId}
          className={cn("h-10 w-full justify-between gap-2 border-border bg-background px-3 font-normal", className)}
        >
          <span className={value ? "text-foreground" : "text-muted-foreground"}>
            {formatDateLabel(value, placeholder)}
          </span>
          <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[292px] p-3">
        <div className="mb-3 flex items-center justify-between">
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Previous month"
            onClick={() => setVisibleMonth(new Date(year, month - 1, 1))}>
            <ChevronLeft className="size-4" />
          </Button>
          <p className="text-sm font-semibold text-foreground">
            {new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(visibleMonth)}
          </p>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Next month"
            onClick={() => setVisibleMonth(new Date(year, month + 1, 1))}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weekdays.map((day, index) => (
            <span key={day + "-" + index} className="py-1 text-center text-[10px] font-medium text-muted-foreground">
              {day}
            </span>
          ))}
          {days.map((day) => {
            const key = dateKey(day);
            const inMonth = day.getMonth() === month;
            const isSelected = key === value;
            const isToday = key === dateKey(new Date());
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  onChange(key);
                  setOpen(false);
                }}
                aria-label={new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(day)}
                aria-pressed={isSelected}
                className={cn(
                  "grid size-8 place-items-center rounded-md text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  isSelected
                    ? "bg-accent font-semibold text-accent-foreground"
                    : inMonth
                      ? "text-foreground hover:bg-muted"
                      : "text-muted-foreground/45 hover:bg-muted/60",
                  isToday && !isSelected && "border border-accent/50",
                )}
              >
                {day.getDate()}
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex justify-end border-t border-border pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={() => {
            const today = new Date();
            onChange(dateKey(today));
            setVisibleMonth(new Date(today.getFullYear(), today.getMonth(), 1));
            setOpen(false);
          }}>
            Today
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

type TimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
};

export function TimePicker({
  value,
  onChange,
  ariaLabel = "Choose time",
  id,
  disabled = false,
  className,
  "data-testid": testId,
}: TimePickerProps) {
  return (
    <div className={cn("relative", className)}>
      <Clock3 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
      <input
        type="time"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={ariaLabel}
        id={id}
        disabled={disabled}
        data-testid={testId}
        className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      />
    </div>
  );
}

type DateTimePickerProps = {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
  compact?: boolean;
};

function currentLocalDateTime(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate())
    + "T" + pad(now.getHours()) + ":" + pad(now.getMinutes());
}

export function DateTimePicker({
  value,
  onChange,
  ariaLabel = "Date and time",
  disabled = false,
  className,
  "data-testid": testId,
  compact = false,
}: DateTimePickerProps) {
  const pieces = value.split("T");
  const date = pieces[0] ?? "";
  const time = pieces[1] || "00:00";
  const updateDate = (nextDate: string) => onChange(nextDate ? nextDate + "T" + (time || "00:00") : "");
  const updateTime = (nextTime: string) => onChange(date ? date + "T" + (nextTime || "00:00") : value);

  return (
    <div className={cn(compact ? "grid grid-cols-[minmax(0,1fr)_minmax(0,.92fr)_2.5rem] gap-2" : "grid grid-cols-[minmax(0,1fr)_minmax(0,.72fr)_auto] gap-2", className)} aria-label={ariaLabel}>
      <DatePicker value={date} onChange={updateDate} disabled={disabled} ariaLabel={`${ariaLabel} date`}
        data-testid={testId ? testId + "-date" : undefined} />
      <TimePicker value={time} onChange={updateTime} disabled={disabled} ariaLabel={`${ariaLabel} time`}
        data-testid={testId ? testId + "-time" : undefined} />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => onChange(currentLocalDateTime())}
        aria-label={`Set ${ariaLabel.toLowerCase()} to now`}
        title="Set to current date and time"
        className={cn("h-10 shrink-0", compact ? "w-10 px-0" : "px-3")}
      >
        {compact ? <LocateFixed className="size-4" aria-hidden="true" /> : "Now"}
      </Button>
    </div>
  );
}
