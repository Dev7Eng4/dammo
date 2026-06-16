import { cn } from '../../lib/cn';
import { DropdownSelect, type DropdownSelectOption } from './DropdownSelect';

export type SelectOption = DropdownSelectOption;

export interface SelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export function Select({
  options,
  value,
  onChange,
  onBlur,
  placeholder,
  searchable,
  searchPlaceholder,
  disabled,
  id,
  className,
}: SelectProps) {
  return (
    <DropdownSelect
      id={id}
      options={options}
      value={value}
      onChange={onChange}
      onBlur={onBlur}
      placeholder={placeholder}
      searchable={searchable}
      searchPlaceholder={searchPlaceholder}
      disabled={disabled}
      className="w-full"
      triggerClassName={cn('h-10 w-full min-w-0 rounded-lg px-3 py-0', className)}
      menuClassName="z-50"
    />
  );
}
