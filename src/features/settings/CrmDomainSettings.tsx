import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, InlineLoading, InlineNotification, Select, SelectItem, Table, TableHead, TableRow, TableHeader, TableBody, TableCell, Tag, TextArea, TextInput } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

export type CrmSettingsDomain = 'contacts' | 'accounts' | 'leads';
type Field = { key:string; label:string; type?:'text'|'number'|'select'|'textarea'; options?:Array<[string,string]> };
type Item = { id:string; name:string; code:string|null; config:Record<string,unknown>; sequence:number; is_active:boolean };
type Section = { id:string; label:string; group:string; description:string; implemented:true };
const yesNo:Array<[string,string]>=[['true','是'],['false','否']];
const options = (values:string[]) => values.map(value=>[value,value] as [string,string]);

export const crmSettingSections:Record<CrmSettingsDomain,Section[]> = {
 contacts:[
  {id:'salutations',label:'称谓与称呼',group:'身份与组织',description:'维护先生、女士、博士等称谓及称呼规则。',implemented:true},
  {id:'roles',label:'联系人角色',group:'身份与组织',description:'采购、决策人、财务、物流、技术等多角色字典。',implemented:true},
  {id:'departments',label:'部门',group:'身份与组织',description:'维护联系人所属部门及部门编码。',implemented:true},
  {id:'job-titles',label:'职位',group:'身份与组织',description:'维护职位名称、职级及决策权限分类。',implemented:true},
  {id:'contact-methods',label:'联系方式类型',group:'联系方式',description:'维护邮箱、电话、手机、WhatsApp、传真等联系方式类型。',implemented:true},
  {id:'social-platforms',label:'社交与聊天平台',group:'联系方式',description:'维护 LinkedIn、Facebook、微信、Skype 等平台。',implemented:true},
  {id:'channels',label:'沟通偏好',group:'沟通与合规',description:'维护首选沟通渠道、联系时段和沟通语言偏好。',implemented:true},
  {id:'languages',label:'沟通语言',group:'沟通与合规',description:'维护联系人可使用的沟通语言。',implemented:true},
  {id:'statuses',label:'联系人状态',group:'沟通与合规',description:'在职、离职、休眠、无效等状态及停用规则。',implemented:true},
  {id:'sources',label:'联系人来源',group:'归属与数据',description:'手动录入、线索转换、导入、名片识别及情报采集。',implemented:true},
  {id:'consent-types',label:'授权与同意类型',group:'归属与数据',description:'营销授权、数据处理同意、退订和联系限制。',implemented:true},
  {id:'data-rules',label:'联系人数据规则',group:'归属与数据',description:'主联系人唯一性、必填、查重及离职处理规则。',implemented:true},
  {id:'custom-fields',label:'自定义字段',group:'归属与数据',description:'定义联系人扩展字段、字段类型、选项及必填条件。',implemented:true},
 ],
 accounts:[
  {id:'account-types',label:'客户类型',group:'客户主数据',description:'公司、个人、集团、渠道伙伴及供应商等主体类型。',implemented:true},
  {id:'grades',label:'客户等级',group:'客户主数据',description:'A/B/C 等客户等级、评定标准和默认等级。',implemented:true},
  {id:'industries',label:'行业分类',group:'客户主数据',description:'维护多级行业分类，支持全球客户行业归类。',implemented:true},
  {id:'company-sizes',label:'企业规模',group:'客户主数据',description:'按员工人数、营收区间或自定义规模分级。',implemented:true},
  {id:'statuses',label:'客户生命周期状态',group:'客户主数据',description:'潜在、活跃、休眠、流失、黑名单等客户状态。',implemented:true},
  {id:'business-types',label:'业务类型',group:'客户主数据',description:'分销商、批发商、零售商、制造商、贸易商等。',implemented:true},
  {id:'address-types',label:'地址类型',group:'地址与物流',description:'注册地址、办公地址、开票地址、收货地址及其他地址。',implemented:true},
  {id:'payment-terms',label:'付款条件',group:'交易与财务',description:'预付款、定金+尾款、账期及自定义付款节点。',implemented:true},
  {id:'payment-methods',label:'付款方式',group:'交易与财务',description:'T/T、L/C、信用卡、PayPal 等收付款方式。',implemented:true},
  {id:'currencies',label:'交易币种',group:'交易与财务',description:'维护客户默认交易币种和允许结算币种。',implemented:true},
  {id:'incoterms',label:'贸易术语',group:'交易与财务',description:'维护 Incoterms 规则及默认贸易术语。',implemented:true},
  {id:'delivery-methods',label:'交付与运输方式',group:'交易与财务',description:'海运、空运、快递、铁路及客户自提等。',implemented:true},
  {id:'sales-teams',label:'销售团队',group:'销售归属',description:'维护团队、团队负责人及适用区域。',implemented:true},
  {id:'price-groups',label:'客户价格组',group:'销售归属',description:'维护客户价目组和默认价格策略。',implemented:true},
  {id:'credit-ratings',label:'信用等级',group:'风险与规则',description:'维护信用评级、账期上限和授信建议。',implemented:true},
  {id:'sources',label:'客户来源',group:'风险与规则',description:'线索转换、商机转化、官网、展会、推荐及手动录入。',implemented:true},
  {id:'risk-categories',label:'风险分类',group:'风险与规则',description:'制裁、合规、付款、信用及经营风险分类。',implemented:true},
  {id:'data-rules',label:'客户数据规则',group:'风险与规则',description:'客户查重、主联系人、地址默认值、归档及删除限制。',implemented:true},
  {id:'custom-fields',label:'自定义字段',group:'风险与规则',description:'定义客户扩展字段、字段类型、选项及必填条件。',implemented:true},
 ],
 leads:[
  {id:'lead-types',label:'线索类型',group:'线索分类',description:'公司线索、个人线索及渠道合作线索。',implemented:true},
  {id:'statuses',label:'线索生命周期',group:'线索分类',description:'新建、待审核、联系中、已确认、已转换、已失效等状态。',implemented:true},
  {id:'ratings',label:'线索评级',group:'线索分类',description:'热、温、冷评级及评分区间。',implemented:true},
  {id:'sources',label:'线索来源渠道',group:'来源与画像',description:'全网情报、搜索引擎、社交媒体、展会、官网、推荐等。',implemented:true},
  {id:'invalid-reasons',label:'失效原因',group:'来源与画像',description:'无回复、非目标客户、重复、联系方式无效等原因。',implemented:true},
  {id:'company-types',label:'公司类型',group:'来源与画像',description:'分销商、批发商、零售商、制造商、贸易商等。',implemented:true},
  {id:'industries',label:'行业分类',group:'来源与画像',description:'维护线索行业分类，与客户行业分类保持映射。',implemented:true},
  {id:'company-sizes',label:'公司规模',group:'来源与画像',description:'维护员工人数或营收区间。',implemented:true},
  {id:'urgencies',label:'需求紧急程度',group:'资格与转化',description:'高、中、低、未知等需求优先级。',implemented:true},
  {id:'qualification',label:'线索资格评估',group:'资格与转化',description:'预算、需求、采购时间、决策权及产品匹配度评分。',implemented:true},
  {id:'assignment-rules',label:'线索分配规则',group:'资格与转化',description:'按国家、行业、来源、产品兴趣及团队进行分配。',implemented:true},
  {id:'follow-up-rules',label:'跟进时效规则',group:'资格与转化',description:'首次联系 SLA、跟进间隔、逾期提醒及超期升级。',implemented:true},
  {id:'duplicate-rules',label:'重复线索规则',group:'数据治理',description:'按域名、邮箱、电话、公司名称及国家识别重复记录。',implemented:true},
  {id:'conversion-rules',label:'线索转换规则',group:'数据治理',description:'转换为客户/联系人时的字段映射、继承和去重策略。',implemented:true},
  {id:'data-rules',label:'线索数据规则',group:'数据治理',description:'必填字段、联系方式校验、合规限制和导入策略。',implemented:true},
  {id:'custom-fields',label:'自定义字段',group:'数据治理',description:'定义线索扩展字段、字段类型、选项及必填条件。',implemented:true},
 ],
};

const fields:Record<string,Field[]> = {
 'contacts.salutations':[{key:'gender',label:'适用性',type:'select',options:[['all','不限'],['male','男性'],['female','女性']]}],
 'contacts.roles':[{key:'role_group',label:'角色分组',type:'select',options:[['decision','决策层'],['commercial','商务采购'],['finance','财务'],['operations','运营物流'],['technical','技术质量'],['other','其他']]},{key:'decision_power',label:'决策权限',type:'select',options:[['final','最终决策'],['influence','影响决策'],['execute','执行'],['none','无']]}],
 'contacts.departments':[{key:'parent_department',label:'上级部门编码'},{key:'description',label:'部门说明'}],
 'contacts.job-titles':[{key:'seniority',label:'职级',type:'select',options:[['executive','高管'],['director','总监'],['manager','经理'],['specialist','专员'],['other','其他']]},{key:'decision_role',label:'决策角色',type:'select',options:[['decision_maker','决策人'],['influencer','影响者'],['user','使用者'],['gatekeeper','把关人'],['other','其他']]}],
 'contacts.contact-methods':[{key:'method_type',label:'存储类型',type:'select',options:[['email','邮箱'],['phone','电话'],['mobile','手机'],['messaging','即时通讯'],['fax','传真'],['social','社交账号']]},{key:'requires_verification',label:'需要验证',type:'select',options:yesNo},{key:'multiple_allowed',label:'允许多条',type:'select',options:yesNo}],
 'contacts.social-platforms':[{key:'platform_type',label:'平台类型',type:'select',options:[['social','社交网络'],['messaging','即时通讯'],['video','视频平台'],['other','其他']]},{key:'url_pattern',label:'主页 URL 模板'}],
 'contacts.channels':[{key:'channel_type',label:'渠道类别',type:'select',options:[['digital','数字沟通'],['voice','语音'],['in_person','线下'] ]},{key:'best_time_required',label:'需要首选时段',type:'select',options:yesNo}],
 'contacts.languages':[{key:'language_code',label:'语言代码'},{key:'native_name',label:'本地名称'}],
 'contacts.statuses':[{key:'is_terminal',label:'终态',type:'select',options:yesNo},{key:'allow_contact',label:'允许继续联系',type:'select',options:yesNo}],
 'contacts.sources':[{key:'source_group',label:'来源分组',type:'select',options:[['crm','CRM 手动'],['lead','线索转换'],['discovery','全网情报'],['import','数据导入'],['other','其他']]},{key:'immutable',label:'是否只读来源',type:'select',options:yesNo}],
 'contacts.consent-types':[{key:'requires_timestamp',label:'记录授权时间',type:'select',options:yesNo},{key:'requires_evidence',label:'需要授权凭证',type:'select',options:yesNo},{key:'description',label:'合规说明',type:'textarea'}],
 'contacts.data-rules':[{key:'require_account',label:'必须关联客户',type:'select',options:yesNo},{key:'require_name',label:'至少填写名或姓',type:'select',options:yesNo},{key:'single_primary',label:'每客户仅允许一个主联系人',type:'select',options:yesNo},{key:'block_delete_referenced',label:'被业务单据引用后禁止删除',type:'select',options:yesNo},{key:'duplicate_keys',label:'查重字段（逗号分隔）'}],
 'contacts.custom-fields':[{key:'field_type',label:'字段类型',type:'select',options:[['text','文本'],['number','数字'],['date','日期'],['boolean','是/否'],['select','单选'],['multi_select','多选'],['url','网址']]},{key:'required',label:'必填',type:'select',options:yesNo},{key:'options',label:'选项（逗号分隔）'},{key:'help_text',label:'字段说明',type:'textarea'}],
 'accounts.account-types':[{key:'entity_kind',label:'主体类别',type:'select',options:[['company','公司'],['person','个人'],['group','集团'],['partner','渠道伙伴'],['supplier','供应商']]}],
 'accounts.grades':[{key:'score_min',label:'最低评分',type:'number'},{key:'score_max',label:'最高评分',type:'number'},{key:'default',label:'新客户默认等级',type:'select',options:yesNo}],
 'accounts.industries':[{key:'parent_code',label:'上级行业编码'},{key:'description',label:'行业说明'}],
 'accounts.company-sizes':[{key:'employee_min',label:'员工人数下限',type:'number'},{key:'employee_max',label:'员工人数上限',type:'number'},{key:'revenue_range',label:'年营收区间'}],
 'accounts.business-types':[{key:'description',label:'业务类型说明'}],
 'accounts.address-types':[{key:'default_allowed',label:'允许设为默认',type:'select',options:yesNo},{key:'unique_default',label:'每客户该类型仅一个默认地址',type:'select',options:yesNo},{key:'required_fields',label:'必填地址字段（逗号分隔）'}],
 'accounts.payment-terms':[{key:'due_days',label:'账期天数',type:'number'},{key:'deposit_percent',label:'预付款比例（%）',type:'number'},{key:'milestones',label:'付款节点说明',type:'textarea'}],
 'accounts.payment-methods':[{key:'requires_bank',label:'需要银行信息',type:'select',options:yesNo},{key:'description',label:'付款方式说明'}],
 'accounts.currencies':[{key:'iso_code',label:'ISO 币种代码'},{key:'minor_units',label:'小数位数',type:'number'},{key:'default',label:'默认币种',type:'select',options:yesNo}],
 'accounts.incoterms':[{key:'version',label:'Incoterms 版本'},{key:'transport_mode',label:'适用运输方式'},{key:'place_required',label:'必须填写指定地点',type:'select',options:yesNo}],
 'accounts.delivery-methods':[{key:'mode',label:'运输方式',type:'select',options:[['sea','海运'],['air','空运'],['courier','快递'],['rail','铁路'],['road','公路'],['pickup','自提']]},{key:'tracking_required',label:'需要物流追踪',type:'select',options:yesNo}],
 'accounts.sales-teams':[{key:'manager',label:'团队负责人'},{key:'region',label:'负责区域'},{key:'description',label:'团队说明'}],
 'accounts.price-groups':[{key:'currency',label:'默认币种'},{key:'discount_percent',label:'默认折扣（%）',type:'number'},{key:'description',label:'价格组说明'}],
 'accounts.credit-ratings':[{key:'credit_limit',label:'建议授信额度',type:'number'},{key:'credit_days',label:'建议账期（天）',type:'number'},{key:'review_cycle_days',label:'复核周期（天）',type:'number'}],
 'accounts.risk-categories':[{key:'severity',label:'风险等级',type:'select',options:[['low','低'],['medium','中'],['high','高'],['critical','严重']]},{key:'block_transactions',label:'阻止新交易',type:'select',options:yesNo}],
 'accounts.data-rules':[{key:'unique_domain',label:'官网域名查重',type:'select',options:yesNo},{key:'unique_tax_number',label:'税号查重',type:'select',options:yesNo},{key:'unique_name_country',label:'公司名称+国家查重',type:'select',options:yesNo},{key:'protect_referenced',label:'存在交易后禁止删除',type:'select',options:yesNo},{key:'single_primary',label:'必须有且仅有一个主联系人',type:'select',options:yesNo}],
 'leads.lead-types':[{key:'entity_kind',label:'主体类型',type:'select',options:[['company','公司'],['person','个人'],['partner','渠道伙伴']]}],
 'leads.ratings':[{key:'score_min',label:'最低分',type:'number'},{key:'score_max',label:'最高分',type:'number'},{key:'color',label:'标签颜色',type:'select',options:[['red','红色'],['orange','橙色'],['blue','蓝色'],['gray','灰色']]}],
 'leads.invalid-reasons':[{key:'require_note',label:'备注必填',type:'select',options:yesNo},{key:'terminal',label:'设为终态',type:'select',options:yesNo}],
 'leads.company-types':[{key:'description',label:'公司类型说明'}],
 'leads.urgencies':[{key:'priority',label:'默认优先级',type:'number'},{key:'response_hours',label:'要求响应时限（小时）',type:'number'}],
 'leads.qualification':[{key:'weight',label:'评分权重（%）',type:'number'},{key:'required',label:'必须评估',type:'select',options:yesNo},{key:'pass_score',label:'通过分数',type:'number'}],
 'leads.assignment-rules':[{key:'match_field',label:'匹配字段',type:'select',options:[['country','国家/地区'],['industry','行业'],['source','来源'],['product_category','产品类别'],['company_size','公司规模']]},{key:'target_team',label:'目标销售团队'},{key:'priority',label:'规则优先级',type:'number'},{key:'fallback',label:'未匹配时分配给'}],
 'leads.follow-up-rules':[{key:'first_contact_hours',label:'首次联系时限（小时）',type:'number'},{key:'follow_up_days',label:'默认跟进间隔（天）',type:'number'},{key:'overdue_hours',label:'逾期提醒（小时）',type:'number'},{key:'escalate_after_days',label:'升级阈值（天）',type:'number'}],
 'leads.duplicate-rules':[{key:'match_domain',label:'按域名查重',type:'select',options:yesNo},{key:'match_email',label:'按邮箱查重',type:'select',options:yesNo},{key:'match_phone',label:'按电话查重',type:'select',options:yesNo},{key:'match_company_country',label:'公司名称+国家查重',type:'select',options:yesNo},{key:'action',label:'重复处理',type:'select',options:[['merge_sources','合并来源记录'],['review','人工审核'],['reject','拒绝创建']]}],
 'leads.conversion-rules':[{key:'create_account',label:'无匹配客户时创建客户',type:'select',options:yesNo},{key:'reuse_contact',label:'优先复用已有联系人',type:'select',options:yesNo},{key:'inherit_sources',label:'保留全部来源记录',type:'select',options:yesNo},{key:'inherit_owner',label:'继承线索负责人',type:'select',options:yesNo},{key:'require_confirmation',label:'转换前人工确认',type:'select',options:yesNo}],
 'leads.data-rules':[{key:'require_country',label:'国家/地区必填',type:'select',options:yesNo},{key:'require_company_or_person',label:'按线索类型校验名称',type:'select',options:yesNo},{key:'validate_contact',label:'校验邮箱/电话格式',type:'select',options:yesNo},{key:'respect_do_not_contact',label:'遵守禁止联系标记',type:'select',options:yesNo}],
};

const defaults:Record<string,Array<[string,string,Record<string,unknown>]>> = {
 'contacts.salutations':[['mr','先生',{}],['ms','女士',{}],['dr','博士',{}],['prof','教授',{}],['mx','Mx.',{}]],
 'contacts.roles':[['decision_maker','决策人',{role_group:'decision',decision_power:'final'}],['buyer','采购',{role_group:'commercial',decision_power:'execute'}],['finance','财务',{role_group:'finance',decision_power:'none'}],['logistics','物流',{role_group:'operations',decision_power:'none'}],['technical','技术 / 质检',{role_group:'technical',decision_power:'influence'}],['influencer','影响者',{role_group:'decision',decision_power:'influence'}],['other','其他',{role_group:'other',decision_power:'none'}]],
 'contacts.departments':[['sales','销售',{}],['purchasing','采购',{}],['finance','财务',{}],['logistics','物流',{}],['engineering','工程 / 技术',{}],['quality','质量管理',{}],['management','管理层',{}]],
 'contacts.job-titles':[['ceo','CEO',{seniority:'executive',decision_role:'decision_maker'}],['director','总监',{seniority:'director',decision_role:'decision_maker'}],['manager','经理',{seniority:'manager',decision_role:'influencer'}],['specialist','专员',{seniority:'specialist',decision_role:'user'}]],
 'contacts.contact-methods':[['email','邮箱',{method_type:'email',requires_verification:true,multiple_allowed:true}],['phone','电话',{method_type:'phone',requires_verification:false,multiple_allowed:true}],['mobile','手机',{method_type:'mobile',requires_verification:true,multiple_allowed:true}],['whatsapp','WhatsApp',{method_type:'messaging',requires_verification:false,multiple_allowed:true}],['fax','传真',{method_type:'fax',requires_verification:false,multiple_allowed:true}],['social','社交账号',{method_type:'social',requires_verification:false,multiple_allowed:true}]],
 'contacts.social-platforms':[['linkedin','LinkedIn',{platform_type:'social'}],['facebook','Facebook',{platform_type:'social'}],['instagram','Instagram',{platform_type:'social'}],['wechat','微信',{platform_type:'messaging'}],['whatsapp','WhatsApp',{platform_type:'messaging'}],['skype','Skype',{platform_type:'messaging'}],['x','X',{platform_type:'social'}],['youtube','YouTube',{platform_type:'video'}],['tiktok','TikTok',{platform_type:'video'}],['other','其他',{platform_type:'other'}]],
 'contacts.channels':[['email','电子邮件',{channel_type:'digital'}],['whatsapp','WhatsApp',{channel_type:'digital'}],['phone','电话',{channel_type:'voice'}],['video','视频会议',{channel_type:'digital'}],['meeting','线下拜访',{channel_type:'in_person'}]],
 'contacts.languages':[['zh-CN','中文（普通话）',{language_code:'zh-CN'}],['en','英语',{language_code:'en'}],['es','西班牙语',{language_code:'es'}],['fr','法语',{language_code:'fr'}],['de','德语',{language_code:'de'}],['ja','日语',{language_code:'ja'}],['ko','韩语',{language_code:'ko'}]],
 'contacts.statuses':[['active','在职',{is_terminal:false,allow_contact:true}],['inactive','休眠',{is_terminal:false,allow_contact:true}],['departed','已离职',{is_terminal:true,allow_contact:false}],['invalid','无效',{is_terminal:true,allow_contact:false}]],
 'contacts.sources':[['manual','手动录入',{source_group:'crm'}],['lead_conversion','线索转换',{source_group:'lead',immutable:true}],['import','数据导入',{source_group:'import'}],['business_card','名片识别',{source_group:'other'}],['ai_crawl','情报采集',{source_group:'discovery'}]],
 'contacts.consent-types':[['marketing','营销授权',{requires_timestamp:true,requires_evidence:true}],['data_processing','数据处理同意',{requires_timestamp:true,requires_evidence:true}],['do_not_contact','禁止联系',{requires_timestamp:true,requires_evidence:false}],['unsubscribe','退订',{requires_timestamp:true,requires_evidence:false}]],
 'contacts.data-rules':[['contact-baseline','联系人基础规则',{require_account:true,require_name:true,single_primary:true,block_delete_referenced:true,duplicate_keys:'email,mobile,phone,whatsapp'}]],
 'contacts.custom-fields':[['contact-extension','联系人扩展字段',{field_type:'text',required:false}]],
 'accounts.account-types':[['company','公司',{entity_kind:'company'}],['person','个人',{entity_kind:'person'}],['group','集团',{entity_kind:'group'}],['channel','渠道伙伴',{entity_kind:'partner'}]],
 'accounts.grades':[['A','A级',{score_min:80,score_max:100}],['B','B级',{score_min:60,score_max:79}],['C','C级',{score_min:0,score_max:59,default:true}]],
 'accounts.industries':[['consumer-electronics','消费电子',{}],['computer-peripherals','电脑及手机周边',{}],['smart-hardware','智能硬件',{}],['smart-home','智能家居',{}],['gaming','游戏设备及配件',{}],['networking','网络及通信设备',{}],['audio','音频设备',{}],['other','其他',{}]],
 'accounts.company-sizes':[['micro','1–10 人',{employee_min:1,employee_max:10}],['small','11–50 人',{employee_min:11,employee_max:50}],['medium','51–200 人',{employee_min:51,employee_max:200}],['large','201–1,000 人',{employee_min:201,employee_max:1000}],['enterprise','1,001 人以上',{employee_min:1001}]],
 'accounts.statuses':[['active','活跃',{}],['dormant','休眠',{}],['lost','流失',{}],['blacklist','黑名单',{}]],
 'accounts.business-types':[['distributor','分销商',{}],['wholesaler','批发商',{}],['retailer','零售商',{}],['manufacturer','制造商',{}],['trader','贸易商',{}],['brand','品牌商',{}],['other','其他',{}]],
 'accounts.address-types':[['registered','注册地址',{default_allowed:true,unique_default:true}],['office','办公地址',{default_allowed:true,unique_default:true}],['billing','开票地址',{default_allowed:true,unique_default:true}],['shipping','收货地址',{default_allowed:true,unique_default:true}],['other','其他',{default_allowed:true,unique_default:false}]],
 'accounts.payment-terms':[['advance','全额预付',{due_days:0,deposit_percent:100}],['deposit-balance','定金 + 尾款',{due_days:0,deposit_percent:30}],['net30','Net 30',{due_days:30}],['net60','Net 60',{due_days:60}],['custom','自定义付款节点',{}]],
 'accounts.payment-methods':[['tt','T/T 电汇',{requires_bank:true}],['lc','L/C 信用证',{requires_bank:true}],['paypal','PayPal',{requires_bank:false}],['card','信用卡',{requires_bank:false}],['other','其他',{}]],
 'accounts.currencies':[['USD','USD - 美元',{iso_code:'USD',minor_units:2}],['EUR','EUR - 欧元',{iso_code:'EUR',minor_units:2}],['CNY','CNY - 人民币',{iso_code:'CNY',minor_units:2}],['TWD','TWD - 新台币',{iso_code:'TWD',minor_units:0}],['JPY','JPY - 日元',{iso_code:'JPY',minor_units:0}],['GBP','GBP - 英镑',{iso_code:'GBP',minor_units:2}]],
 'accounts.incoterms':[['EXW','EXW',{version:'2020',place_required:true}],['FCA','FCA',{version:'2020',place_required:true}],['FOB','FOB',{version:'2020',place_required:true}],['CFR','CFR',{version:'2020',place_required:true}],['CIF','CIF',{version:'2020',place_required:true}],['CPT','CPT',{version:'2020',place_required:true}],['CIP','CIP',{version:'2020',place_required:true}],['DAP','DAP',{version:'2020',place_required:true}],['DPU','DPU',{version:'2020',place_required:true}],['DDP','DDP',{version:'2020',place_required:true}]],
 'accounts.delivery-methods':[['sea','海运',{mode:'sea'}],['air','空运',{mode:'air'}],['courier','国际快递',{mode:'courier'}],['rail','铁路运输',{mode:'rail'}],['road','公路运输',{mode:'road'}],['pickup','客户自提',{mode:'pickup'}]],
 'accounts.sales-teams':[['global','全球销售团队',{region:'global'}]],
 'accounts.price-groups':[['standard','标准价',{discount_percent:0}],['strategic','战略客户价',{discount_percent:5}],['distributor','分销商价',{discount_percent:10}]],
 'accounts.credit-ratings':[['low','低风险',{credit_days:0,review_cycle_days:365}],['medium','中风险',{credit_days:30,review_cycle_days:180}],['high','高风险',{credit_days:0,review_cycle_days:90}]],
 'accounts.risk-categories':[['sanctions','制裁风险',{severity:'critical',block_transactions:true}],['credit','信用风险',{severity:'high',block_transactions:false}],['payment','付款风险',{severity:'medium',block_transactions:false}],['compliance','合规风险',{severity:'high',block_transactions:true}]],
 'accounts.data-rules':[['account-baseline','客户主数据规则',{unique_domain:true,unique_tax_number:true,unique_name_country:true,protect_referenced:true,single_primary:true}]],
 'accounts.custom-fields':[['account-extension','客户扩展字段',{field_type:'text',required:false}]],
 'leads.lead-types':[['company','公司',{entity_kind:'company'}],['person','个人',{entity_kind:'person'}],['partner','渠道合作',{entity_kind:'partner'}]],
 'leads.statuses':[['new','新建',{}],['contacting','联系中',{}],['confirmed','已确认',{}],['converted','已转换',{}],['invalid','已失效',{}]],
 'leads.ratings':[['hot','热',{score_min:75,score_max:100,color:'red'}],['warm','温',{score_min:40,score_max:74,color:'orange'}],['cold','冷',{score_min:0,score_max:39,color:'blue'}]],
 'leads.sources':[['prospect_conversion','全网情报',{source_group:'discovery'}],['website','官网询盘',{source_group:'inbound'}],['search','搜索引擎',{source_group:'inbound'}],['social','社交媒体',{source_group:'social'}],['exhibition','展会',{source_group:'offline'}],['referral','客户推荐',{source_group:'referral'}],['manual','手动录入',{source_group:'manual'}],['email','邮件',{source_group:'inbound'}],['other','其他',{source_group:'other'}]],
 'leads.invalid-reasons':[['no_response','无回复',{terminal:true}],['not_target','非目标客户',{terminal:true}],['invalid_contact','联系方式无效',{terminal:true}],['duplicate','重复线索',{terminal:true}],['no_budget','无预算',{terminal:true}],['other','其他',{terminal:true}]],
 'leads.company-types':[['distributor','分销商',{}],['wholesaler','批发商',{}],['retailer','零售商',{}],['manufacturer','制造商',{}],['trader','贸易商',{}],['brand','品牌商',{}],['unknown','未知',{}]],
 'leads.industries':[['consumer-electronics','消费电子',{}],['computer-peripherals','电脑及手机周边',{}],['smart-hardware','智能硬件',{}],['smart-home','智能家居',{}],['gaming','游戏设备及配件',{}],['networking','网络及通信设备',{}],['audio','音频设备',{}],['other','其他',{}]],
 'leads.company-sizes':[['micro','1–10 人',{}],['small','11–50 人',{}],['medium','51–200 人',{}],['large','201–1,000 人',{}],['enterprise','1,001 人以上',{}],['unknown','未知',{}]],
 'leads.urgencies':[['high','高',{priority:1,response_hours:4}],['medium','中',{priority:2,response_hours:24}],['low','低',{priority:3,response_hours:72}],['unknown','未知',{priority:4,response_hours:168}]],
 'leads.qualification':[['budget','预算',{weight:20,required:false}],['need','需求明确度',{weight:25,required:true}],['authority','决策权限',{weight:20,required:false}],['timing','采购时间',{weight:15,required:false}],['fit','产品匹配度',{weight:20,required:true}]],
 'leads.assignment-rules':[['global-fallback','默认分配规则',{match_field:'country',priority:999,fallback:'待分配'}]],
 'leads.follow-up-rules':[['standard-sla','标准跟进时效',{first_contact_hours:24,follow_up_days:3,overdue_hours:24,escalate_after_days:7}]],
 'leads.duplicate-rules':[['default-dedupe','默认重复检测',{match_domain:true,match_email:true,match_phone:true,match_company_country:true,action:'review'}]],
 'leads.conversion-rules':[['standard-conversion','标准转换规则',{create_account:true,reuse_contact:true,inherit_sources:true,inherit_owner:true,require_confirmation:true}]],
 'leads.data-rules':[['lead-baseline','线索数据规则',{require_country:true,require_company_or_person:true,validate_contact:true,respect_do_not_contact:true}]],
 'leads.custom-fields':[['lead-extension','线索扩展字段',{field_type:'text',required:false}]],
};

const blank = (schema:Field[]) => Object.fromEntries(schema.map(field=>[field.key,field.type==='select'?(field.options?.[0]?.[0]??''):field.type==='number'?'':'']));
const labels:Record<string,string> = Object.fromEntries(Object.entries(crmSettingSections).flatMap(([domain,sections])=>sections.map(section=>[domain+'.'+section.id,section.label])));

export function useCrmSettingOptions(domain:CrmSettingsDomain,section:string,fallback:Array<{id:string;text:string}>) {
 const [items,setItems]=useState(fallback);
 useEffect(()=>{
  let alive=true;
  void(async()=>{
   try{
    const db=await getSupabaseClient();
    const result=await db.from('crm_master_setting_items').select('id,name,code,is_active,sequence').eq('domain',domain).eq('setting_type',section).order('sequence').order('name');
    if(result.error)throw result.error;
    if(!alive)return;
    const merged=new Map<string,{id:string;text:string}>(fallback.map(item=>[item.id,item]));
    for(const row of result.data??[]){
     const key=String(row.code||row.name);
     if(row.is_active)merged.set(key,{id:key,text:row.name});
     else merged.delete(key);
    }
    setItems([...merged.values()]);
   }catch{/* Keep safe built-in options when the settings API is unavailable. */}
  })();
  return()=>{alive=false};
 },[domain,section]);
 return items;
}

export function CrmDomainSettings({domain,section}:{domain:CrmSettingsDomain;section:string}) {
 const schema=fields[domain+'.'+section]??[];
 const [rows,setRows]=useState<Item[]>([]);
 const [name,setName]=useState('');
 const [code,setCode]=useState('');
 const [config,setConfig]=useState<Record<string,unknown>>({});
 const [editing,setEditing]=useState<string|null>(null);
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{const db=await getSupabaseClient();const result=await db.from('crm_master_setting_items').select('id,name,code,config,sequence,is_active').eq('domain',domain).eq('setting_type',section).order('sequence').order('name');if(result.error)throw result.error;setRows((result.data??[]) as Item[])}
  catch(e){setError(e instanceof Error?e.message:'读取 CRM 设置失败')}
  finally{setLoading(false)}
 },[domain,section]);
 useEffect(()=>{setRows([]);setName('');setCode('');setConfig(blank(schema));setEditing(null);setNotice('');void load()},[domain,section,load]);
 const values=useMemo(()=>{
  const base:(Item[])=(defaults[domain+'.'+section]??[]).map(([code,name,config],index)=>({id:'default-'+code,code,name,config,sequence:(index+1)*10,is_active:true}));
  const byCode=new Map<string,Item>(base.map(item=>[item.code||item.name,item]));
  rows.forEach(item=>byCode.set(item.code||item.name,item));
  return [...byCode.values()].sort((a,b)=>a.sequence-b.sequence||a.name.localeCompare(b.name));
 },[rows,domain,section]);
 const reset=()=>{setName('');setCode('');setConfig(blank(schema));setEditing(null)};
 const edit=(item:Item)=>{
  setName(item.name);setCode(item.code??'');setConfig({...blank(schema),...(item.config??{})});
  setEditing(item.id.startsWith('default-')?null:item.id);
  setNotice(item.id.startsWith('default-')?'系统预置项：保存后将新增一条自定义配置。':'');
 };
 const save=async()=>{
  if(!name.trim())return;
  setSaving(true);setError('');setNotice('');
  try{const db=await getSupabaseClient();const {data:auth}=await db.auth.getSession();const owner=auth.session?.user.id;if(!owner)throw new Error('登录状态已失效，请重新登录。');
   const payload={name:name.trim(),code:code.trim()||null,config,updated_at:new Date().toISOString()};
   const result=editing?await db.from('crm_master_setting_items').update(payload).eq('id',editing).select('id,name,code,config,sequence,is_active').single():await db.from('crm_master_setting_items').insert({...payload,owner_id:owner,domain,setting_type:section,sequence:(rows.length+1)*10,is_active:true}).select('id,name,code,config,sequence,is_active').single();
   if(result.error)throw result.error;
   if(editing)setRows(old=>old.map(item=>item.id===editing?result.data as Item:item));else setRows(old=>[...old,result.data as Item]);
   reset();setNotice('配置已保存；后续业务录入将使用启用项。');
  }catch(e){setError(e instanceof Error?e.message:'保存配置失败')}
  finally{setSaving(false)}
 };
 const toggle=async(item:Item)=>{
  setError('');setNotice('');
  try{const db=await getSupabaseClient();
   if(item.id.startsWith('default-')){
    const {data:auth}=await db.auth.getSession();const owner=auth.session?.user.id;if(!owner)throw new Error('登录状态已失效，请重新登录。');
    const result=await db.from('crm_master_setting_items').insert({owner_id:owner,domain,setting_type:section,name:item.name,code:item.code,config:item.config,sequence:item.sequence,is_active:false}).select('id,name,code,config,sequence,is_active').single();
    if(result.error)throw result.error;setRows(old=>[...old,result.data as Item]);return;
   }
   const result=await db.from('crm_master_setting_items').update({is_active:!item.is_active,updated_at:new Date().toISOString()}).eq('id',item.id);
   if(result.error)throw result.error;setRows(old=>old.map(row=>row.id===item.id?{...row,is_active:!item.is_active}:row));
  }catch(e){setError(e instanceof Error?e.message:'更新配置状态失败')}
 };
 const display=(field:Field,value:unknown)=>field.options?.find(([v])=>v===String(value))?.[1]??(value===true?'是':value===false?'否':String(value??'—'));
 return <div className="tp-settings__advanced">
  {error&&<InlineNotification kind="error" title="设置操作失败" subtitle={error} onCloseButtonClick={()=>setError('')}/>}
  {notice&&<InlineNotification kind="info" title="提示" subtitle={notice} onCloseButtonClick={()=>setNotice('')}/>}
  <div className="tp-settings__editor">
   <div className="tp-settings__editor-title"><h4>{editing?'编辑':'新增'}{labels[domain+'.'+section]??'CRM 设置'}</h4>{(editing||name)&&<Button kind="ghost" size="sm" onClick={reset}>取消编辑</Button>}</div>
   <div className="tp-settings__editor-grid">
    <TextInput id={'crm-setting-name-'+domain+'-'+section} labelText="名称" value={name} onChange={e=>setName(e.currentTarget.value)}/>
    <TextInput id={'crm-setting-code-'+domain+'-'+section} labelText="编码（建议唯一）" value={code} onChange={e=>setCode(e.currentTarget.value)}/>
    {schema.map(field=>{
     const value=config[field.key]??(field.type==='select'?(field.options?.[0]?.[0]??''):'');
     if(field.type==='textarea')return <div className="tp-settings__field--wide" key={field.key}><TextArea id={'crm-setting-'+domain+'-'+section+'-'+field.key} labelText={field.label} rows={3} value={String(value)} onChange={e=>setConfig(current=>({...current,[field.key]:e.currentTarget.value}))}/></div>;
     if(field.type==='select')return <Select key={field.key} id={'crm-setting-'+domain+'-'+section+'-'+field.key} labelText={field.label} value={String(value)} onChange={e=>setConfig(current=>({...current,[field.key]:e.currentTarget.value}))}>{(field.options??[]).map(([v,label])=><SelectItem key={v} value={v} text={label}/>)}</Select>;
     return <TextInput key={field.key} id={'crm-setting-'+domain+'-'+section+'-'+field.key} labelText={field.label} type={field.type==='number'?'number':'text'} value={String(value)} onChange={e=>setConfig(current=>({...current,[field.key]:field.type==='number'?(e.currentTarget.value===''?'':Number(e.currentTarget.value)):e.currentTarget.value}))}/>;
    })}
    <Button kind="primary" disabled={saving||!name.trim()} onClick={()=>void save()}>{saving?'保存中…':editing?'保存修改':'新增配置'}</Button>
   </div>
  </div>
  <div className="tp-settings__table-wrap">
   <Table><TableHead><TableRow><TableHeader>名称</TableHeader><TableHeader>编码</TableHeader>{schema.slice(0,3).map(field=><TableHeader key={field.key}>{field.label}</TableHeader>)}<TableHeader>状态</TableHeader><TableHeader>操作</TableHeader></TableRow></TableHead>
    <TableBody>{values.map(item=><TableRow key={item.id}><TableCell>{item.name}</TableCell><TableCell>{item.code??'—'}</TableCell>{schema.slice(0,3).map(field=><TableCell key={field.key}>{display(field,item.config?.[field.key])}</TableCell>)}<TableCell><Tag type={item.is_active?'green':'cool-gray'}>{item.is_active?'启用':'停用'}</Tag></TableCell><TableCell><Button kind="ghost" size="sm" onClick={()=>edit(item)}>编辑</Button><Button kind="ghost" size="sm" onClick={()=>void toggle(item)}>{item.is_active?'停用':'启用'}</Button></TableCell></TableRow>)}</TableBody>
   </Table>
   {loading&&<InlineLoading description="正在读取 CRM 设置…"/>}
   {!loading&&!values.length&&<p className="tp-settings__empty">暂无配置记录。</p>}
  </div>
  <p className="tp-settings__hint">系统预置项可自定义覆盖；停用只影响后续选择，不删除历史数据。配置值保留在业务记录中，历史商机、联系人、客户和线索不会因配置调整而被重写。</p>
 </div>;
}
