import { useNavigate } from 'react-router-dom';
import { Button, Content } from '@/design-system';

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <Content>
      <div className="tp-not-found" role="status" aria-labelledby="tp-not-found-title">
        <p className="tp-not-found__code">404</p>
        <h1 id="tp-not-found-title">找不到这个页面</h1>
        <p>你访问的地址可能已更改，或页面不存在。请返回工作台继续操作。</p>
        <Button kind="primary" onClick={() => navigate('/dashboard', { replace: true })}>
          返回工作台
        </Button>
      </div>
    </Content>
  );
}
