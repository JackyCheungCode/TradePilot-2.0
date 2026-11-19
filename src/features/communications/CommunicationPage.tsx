import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomerCommunicationsWidget } from '../customer-communications/CustomerCommunicationsWidget';
import '../../design-system/styles/communication-workspace.scss';

/** Odoo-inspired three-pane CRM communications workspace using Carbon design tokens. */
export function CommunicationPage() {
  const navigate = useNavigate();
  const params = new URLSearchParams(window.location.search);
  const popupMode = params.get('chatPopup') === '1';
  const initialCustomerId = params.get('contact') ?? '';

  useEffect(() => {
    if (!popupMode) return;
    document.body.classList.add('tp-chat-popup-window');
    return () => document.body.classList.remove('tp-chat-popup-window');
  }, [popupMode]);

  return (
    <CustomerCommunicationsWidget
      open
      minimized={false}
      fullPage
      popupMode={popupMode}
      initialCustomerId={initialCustomerId}
      onClose={() => popupMode ? window.close() : navigate('/dashboard')}
      onMinimize={() => navigate('/dashboard')}
      onRestore={() => undefined}
      navigationExpanded={false}
      onUnreadCountChange={() => undefined}
    />
  );
}
