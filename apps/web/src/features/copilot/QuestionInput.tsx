import type { KeyboardEvent } from 'react';
import { CornerDownLeftIcon } from 'lucide-react';
import { QUESTION_MAX_CHARS, QUESTION_MIN_CHARS } from '@devbrief/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

type QuestionInputProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
};

export function QuestionInput({ value, onChange, onSubmit }: QuestionInputProps) {
  const canSubmit = value.trim().length >= QUESTION_MIN_CHARS;

  function submitOnEnter(event: KeyboardEvent<HTMLInputElement>) {
    // An Enter that confirms an IME composition is not a submit.
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canSubmit) onSubmit();
  }

  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <Input
          aria-label="Your question"
          placeholder="Ask about this week's news…"
          maxLength={QUESTION_MAX_CHARS}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={submitOnEnter}
        />
        <Button size="icon" aria-label="Ask" disabled={!canSubmit} onClick={onSubmit}>
          <CornerDownLeftIcon />
        </Button>
      </div>
      <p className="text-muted-foreground text-right text-xs tabular-nums">
        {value.length}/{QUESTION_MAX_CHARS}
      </p>
    </div>
  );
}
