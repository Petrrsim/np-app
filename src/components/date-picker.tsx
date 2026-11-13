"use client";

import { useState } from "react";
import { CalendarIcon } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function DatePicker({
  selected,
  onSelect,
}: {
  selected: Date | undefined;
  onSelect: (date: Date | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <CalendarIcon className="size-4" />
          {selected ? format(selected, "d MMM yyyy") : "Pick a date"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <DayPicker
          mode="single"
          selected={selected}
          onSelect={(date) => {
            onSelect(date);
            setOpen(false);
          }}
          autoFocus
        />
      </PopoverContent>
    </Popover>
  );
}
