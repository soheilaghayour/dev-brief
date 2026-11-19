import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/cn';

type ToggleGroupProps<Value extends string> = {
  /** Names the group for assistive technology. */
  label: string;
  options: readonly { value: Value; label: string }[];
  value: Value;
  onValueChange: (value: Value) => void;
  className?: string;
};

/** A segmented control: one pressed button out of a few, e.g. Top / Latest. */
function ToggleGroup<Value extends string>({
  label,
  options,
  value,
  onValueChange,
  className,
}: ToggleGroupProps<Value>) {
  return (
    <div
      role="group"
      aria-label={label}
      data-slot="toggle-group"
      className={cn('bg-muted inline-flex rounded-md border p-0.5', className)}
    >
      {options.map((option) => (
        <Button
          key={option.value}
          variant="segment"
          size="xs"
          aria-pressed={value === option.value}
          onClick={() => onValueChange(option.value)}
        >
          {option.label}
        </Button>
      ))}
    </div>
  );
}

export { ToggleGroup };
