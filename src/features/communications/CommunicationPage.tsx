import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CustomerCommunicationsWidget } from '../customer-communications/CustomerCommunicationsWidget';
import { semanticIcons } from '@/design-system';
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
    <div className="tp-communications-route">
      {!popupMode && (
        <header className="tp-communications-page-header">
          <nav className="tp-communications-breadcrumb" aria-label="面包屑">
            <span>客户管理</span>
            <semanticIcons.chevronRight size={14} aria-hidden="true" />
            <span aria-current="page">沟通</span>
          </nav>
          <div className="tp-communications-page-title">
            <span className="tp-communications-page-icon" aria-hidden="true"><semanticIcons.chat size={22} /></span>
            <div>
              <h1>沟通</h1>
              <p>统一管理客户会话、沟通记录与跟进建议</p>
            </div>
          </div>
        </header>
      )}
      <div className="tp-communications-workspace">
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
      </div>
    </div>
  );
}
