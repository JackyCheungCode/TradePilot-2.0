import { useNavigate } from 'react-router-dom';
import { CustomerCommunicationsWidget } from './CustomerCommunicationsWidget';

/** Full-page route for the existing, data-backed customer communications workspace. */
export function CustomerCommunicationsPage() {
  const navigate = useNavigate();
  return (
    <CustomerCommunicationsWidget
      open
      minimized={false}
      fullPage
      onClose={() => navigate('/dashboard')}
      onMinimize={() => navigate('/dashboard')}
      onRestore={() => undefined}
      navigationExpanded={false}
      onUnreadCountChange={() => undefined}
    />
  );
}
