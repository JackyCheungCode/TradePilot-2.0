import { useNavigate } from 'react-router-dom';
import { CustomerCommunicationsWidget } from '../customer-communications/CustomerCommunicationsWidget';
import '../../design-system/styles/communication-workspace.scss';

/** Odoo-inspired three-pane CRM communications workspace using Carbon design tokens. */
export function CommunicationPage() {
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
