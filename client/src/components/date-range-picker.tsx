import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, X } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

interface DateRangePickerProps {
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
  // New props for multi-date selection
  selectedDates?: string[];
  onSelectedDatesChange?: (dates: string[]) => void;
  useMultiSelect?: boolean;
}

export default function DateRangePicker({ 
  startDate, 
  endDate, 
  onStartDateChange, 
  onEndDateChange,
  selectedDates = [],
  onSelectedDatesChange,
  useMultiSelect = false
}: DateRangePickerProps) {
  const [isStartOpen, setIsStartOpen] = useState(false);
  const [isEndOpen, setIsEndOpen] = useState(false);
  const [isMultiOpen, setIsMultiOpen] = useState(false);

  const startDateObj = startDate ? new Date(startDate) : undefined;
  const endDateObj = endDate ? new Date(endDate) : undefined;
  const selectedDateObjs = selectedDates.map(date => new Date(date));

  const handleStartDateSelect = (date: Date | undefined) => {
    if (date) {
      onStartDateChange(format(date, "yyyy-MM-dd"));
      setIsStartOpen(false);
    }
  };

  const handleEndDateSelect = (date: Date | undefined) => {
    if (date) {
      onEndDateChange(format(date, "yyyy-MM-dd"));
      setIsEndOpen(false);
    }
  };

  const handleMultiDateSelect = (date: Date | undefined) => {
    if (!date || !onSelectedDatesChange) return;
    
    const dateStr = format(date, "yyyy-MM-dd");
    const currentDates = [...selectedDates];
    const existingIndex = currentDates.indexOf(dateStr);
    
    if (existingIndex > -1) {
      // Remove date if already selected
      currentDates.splice(existingIndex, 1);
    } else {
      // Add date if not selected
      currentDates.push(dateStr);
      currentDates.sort(); // Keep dates sorted
    }
    
    onSelectedDatesChange(currentDates);
  };

  const removeDateFromSelection = (dateToRemove: string) => {
    if (!onSelectedDatesChange) return;
    const updatedDates = selectedDates.filter(date => date !== dateToRemove);
    onSelectedDatesChange(updatedDates);
  };

  if (useMultiSelect) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>Custom Date Selection</Label>
          <Popover open={isMultiOpen} onOpenChange={setIsMultiOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  selectedDates.length === 0 && "text-muted-foreground"
                )}
                data-testid="button-multi-date-picker"
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {selectedDates.length > 0 
                  ? `${selectedDates.length} date${selectedDates.length > 1 ? 's' : ''} selected`
                  : <span>Select custom dates</span>
                }
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <div className="p-3">
                <div className="text-sm text-muted-foreground mb-2">
                  Click dates to select/deselect. You can select dates from different months.
                </div>
                <Calendar
                  mode="multiple"
                  selected={selectedDateObjs}
                  onSelect={(dates) => {
                    if (dates && onSelectedDatesChange) {
                      const formattedDates = dates.map(date => format(date, "yyyy-MM-dd")).sort();
                      onSelectedDatesChange(formattedDates);
                    }
                  }}
                  initialFocus
                  data-testid="calendar-multi-select"
                />
              </div>
            </PopoverContent>
          </Popover>
        </div>
        
        {/* Display selected dates as badges */}
        {selectedDates.length > 0 && (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Selected Dates:</Label>
            <div className="flex flex-wrap gap-2" data-testid="selected-dates-container">
              {selectedDates.map((date) => (
                <Badge 
                  key={date} 
                  variant="secondary" 
                  className="flex items-center gap-1"
                  data-testid={`selected-date-${date}`}
                >
                  {format(new Date(date), "MMM d, yyyy")}
                  <X 
                    className="h-3 w-3 cursor-pointer hover:text-destructive" 
                    onClick={() => removeDateFromSelection(date)}
                    data-testid={`remove-date-${date}`}
                  />
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Original date range picker for backward compatibility
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-2">
        <Label>Start Date</Label>
        <Popover open={isStartOpen} onOpenChange={setIsStartOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !startDateObj && "text-muted-foreground"
              )}
              data-testid="button-start-date-picker"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDateObj ? format(startDateObj, "PPP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={startDateObj}
              onSelect={handleStartDateSelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <Input
          type="date"
          value={startDate}
          onChange={(e) => onStartDateChange(e.target.value)}
          data-testid="input-start-date-direct"
        />
      </div>

      <div className="space-y-2">
        <Label>End Date</Label>
        <Popover open={isEndOpen} onOpenChange={setIsEndOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                "w-full justify-start text-left font-normal",
                !endDateObj && "text-muted-foreground"
              )}
              data-testid="button-end-date-picker"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDateObj ? format(endDateObj, "PPP") : <span>Pick a date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar
              mode="single"
              selected={endDateObj}
              onSelect={handleEndDateSelect}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <Input
          type="date"
          value={endDate}
          onChange={(e) => onEndDateChange(e.target.value)}
          data-testid="input-end-date-direct"
        />
      </div>
    </div>
  );
}
