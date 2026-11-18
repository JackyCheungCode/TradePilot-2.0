import { Link, CarbonIcons } from '@/design-system';
import { DocumentTemplateSettings } from '@/features/settings/DocumentTemplateSettings';
import '@/design-system/patterns/documents.scss';
export function DocumentTemplateCenterPage(){return <main className="tp-documents tp-document-center-page"><header className="tp-documents__header"><div><p className="tp-documents__eyebrow">TRADE DOCUMENT STUDIO / TEMPLATE LIBRARY</p><h1>模板中心</h1><p>集中管理单据预设模板、企业模板和自定义版式。模板与历史单据版本相互独立。</p></div><div className="tp-documents__actions"><Link href="/documents" renderIcon={CarbonIcons.ArrowLeft}>返回制作中心</Link><Link href="/documents/studio" renderIcon={CarbonIcons.Add}>在画布中新建模板</Link></div></header><DocumentTemplateSettings/></main>;}
