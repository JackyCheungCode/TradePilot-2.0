import { Button, CarbonIcons } from '@/design-system';
import { useNavigate } from 'react-router-dom';
import { DocumentTemplateSettings } from '@/features/settings/DocumentTemplateSettings';
import '@/design-system/patterns/documents.scss';
export function DocumentTemplateCenterPage(){const navigate=useNavigate();return <main className="tp-documents tp-document-center-page"><header className="tp-documents__header"><div><p className="tp-documents__eyebrow">TRADE DOCUMENT STUDIO / TEMPLATE LIBRARY</p><h1>模板中心</h1><p>集中管理单据预设模板、企业模板和自定义版式。模板与历史单据版本相互独立。</p></div><div className="tp-documents__actions"><Button kind="tertiary" renderIcon={CarbonIcons.ArrowLeft} onClick={()=>navigate('/documents')}>返回制作中心</Button><Button kind="primary" renderIcon={CarbonIcons.Add} onClick={()=>navigate('/documents/studio')}>在画布中新建模板</Button></div></header><DocumentTemplateSettings/></main>;}
