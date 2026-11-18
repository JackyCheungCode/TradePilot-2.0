import { useEffect, useState } from 'react';
import './date-field.scss';
import { DatePicker, DatePickerInput } from '../DatePicker';
import { TimePicker } from '../TimePicker';

export interface DateFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  helperText?: string;
  placeholder?: string;
}

export function DateField({
  id, label, value, onChange, disabled = false, readOnly = false,
  helperText, placeholder = 'YYYY-MM-DD',
}: DateFieldProps) {
  return (
    <DatePicker
      datePickerType="single"
      dateFormat="Y-m-d"
      value={value || ''}
      onChange={(_dates, dateString) => onChange(dateString)}
    >
      <DatePickerInput
        id={id}
        labelText={label}
        placeholder={placeholder}
        helperText={helperText}
        disabled={disabled}
        readOnly={readOnly}
        type="text"
      />
    </DatePicker>
  );
}

export interface DateRangeFieldProps {
  id: string;
  label: string;
  value: [string, string];
  onChange: (value: [string, string]) => void;
  disabled?: boolean;
}

const formatDate = (date?: Date) => {
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export function DateRangeField({ id, label, value, onChange, disabled = false }: DateRangeFieldProps) {
  const [start, end] = value;
  return (
    <DatePicker
      datePickerType="range"
      dateFormat="Y-m-d"
      value={[start || '', end || '']}
      onChange={(dates) => onChange([formatDate(dates[0]), formatDate(dates[1])])}
    >
      <DatePickerInput id={`${id}-start`} labelText={`${label}开始日期`} placeholder="YYYY-MM-DD" disabled={disabled} type="text" />
      <DatePickerInput id={`${id}-end`} labelText={`${label}结束日期`} placeholder="YYYY-MM-DD" disabled={disabled} type="text" />
    </DatePicker>
  );
}

export interface DateTimeFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
}

export function DateTimeField({ id, label, value, onChange, disabled = false, readOnly = false }: DateTimeFieldProps) {
  const [date, setDate] = useState(value?.split('T')[0] || '');
  const [time, setTime] = useState(value?.split('T')[1]?.slice(0, 5) || '');

  useEffect(() => {
    setDate(value?.split('T')[0] || '');
    setTime(value?.split('T')[1]?.slice(0, 5) || '');
  }, [value]);

  const update = (nextDate: string, nextTime: string) => {
    setDate(nextDate);
    setTime(nextTime);
    onChange(nextDate && nextTime ? `${nextDate}T${nextTime}` : '');
  };

  return (
    <div className="tp-date-time-field">
      <DateField
        id={`${id}-date`}
        label={`${label}日期`}
        value={date}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(nextDate) => update(nextDate, time)}
      />
      <TimePicker
        id={`${id}-time`}
        labelText={`${label}时间`}
        type="text"
        placeholder="HH:mm"
        pattern="([01]?[0-9]|2[0-3]):[0-5][0-9]"
        value={time}
        disabled={disabled}
        readOnly={readOnly}
        onChange={(event) => update(date, event.currentTarget.value)}
      />
    </div>
  );
}
