import { InlineLoading } from '../InlineLoading';

export type TPInlineLoadingStatus = 'inactive' | 'active' | 'finished' | 'error';

export interface TPInlineLoadingProps {
  status?: TPInlineLoadingStatus;
  description?: string;
  successDescription?: string;
  errorDescription?: string;
  className?: string;
  iconDescription?: string;
  onSuccess?: () => void;
}

/** Consistent Carbon inline feedback for submissions and short actions. */
export function TPInlineLoading({
  status = 'active',
  description = '正在处理…',
  successDescription = '已完成',
  errorDescription = '处理失败',
  className,
  iconDescription,
  onSuccess,
}: TPInlineLoadingProps) {
  return (
    <InlineLoading
      status={status}
      description={status === 'finished' ? successDescription : status === 'error' ? errorDescription : description}
      iconDescription={iconDescription}
      className={['tp-inline-loading', className].filter(Boolean).join(' ')}
      onSuccess={onSuccess}
    />
  );
}
