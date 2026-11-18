import { Link, CarbonIcons } from '@/design-system';
import { EnterpriseProfileSettings } from '@/features/settings/EnterpriseProfileSettings';
import '@/design-system/patterns/documents.scss';
import '@/design-system/patterns/settings.scss';
export function DocumentCompanyProfilePage(){return <main className="tp-documents tp-document-center-page"><header className="tp-documents__header"><div><p className="tp-documents__eyebrow">TRADE DOCUMENT STUDIO / COMPANY PROFILE</p><h1>企业信息配置</h1><p>自动读取系统企业主档及收款银行账户。修改后可供新建单据调用，历史单据保留原始快照。</p></div><div className="tp-documents__actions"><Link href="/documents" renderIcon={CarbonIcons.ArrowLeft}>返回制作中心</Link></div></header><EnterpriseProfileSettings/></main>;}
