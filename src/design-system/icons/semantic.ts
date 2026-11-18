/**
 * TradePilot semantic Carbon icon registry.
 * Feature code should use semanticIcons rather than selecting arbitrary glyphs.
 */
import {
  Add, Analytics, Api, Archive, ArrowLeft, ArrowRight,
  Activity, ArrowUp, Asleep, Attachment, Building, Calculator, Calendar, Catalog, Certificate,
  ChartLine, Chat, Checkmark, CheckmarkFilled, ChevronDown, ChevronLeft,
  ChevronRight, Close, CloudUpload, Currency, CurrencyDollar, Dashboard,
  DataBase, DataVis_4, Delivery, Document, DocumentMultiple_01, DocumentPdf,
  DocumentTasks, DocumentView, Download, Edit, Email, Filter, Folder,
  Globe, Information, Launch, Location, MachineLearningModel, MagicWand,
  Map, ModelBuilder, Network_4, Notebook, Notification, Package, PaintBrush,
  Phone, Play, Product, Renew, Save, Search, SearchLocate, Security, Send,
  Settings, SettingsAdjust, Share, ShoppingCart, Star, Task, TaskComplete,
  Template, Time, Tools, Translate, TrashCan, Upload, User, UserAvatar,
  UserFollow, UserMultiple, UserSettings, View, ViewOff, Wallet, WarningAlt,
  Workspace, Sun, Moon, Cloudy, PartlyCloudy, Fog, Rain, Snow, Thunderstorm,
  Temperature, OverflowMenuVertical, ErrorFilled,
} from '@carbon/icons-react';

export const semanticIcons = {
  activity: Activity, add: Add, analytics: Analytics, api: Api, archive: Archive, asleep: Asleep,
  back: ArrowLeft, next: ArrowRight, arrowUp: ArrowUp, externalLink: Launch, attachment: Attachment,
  building: Building, calculator: Calculator, calendar: Calendar, catalog: Catalog,
  certificate: Certificate, chart: ChartLine, chat: Chat, check: Checkmark,
  success: CheckmarkFilled, chevronDown: ChevronDown, chevronLeft: ChevronLeft,
  chevronRight: ChevronRight, close: Close, cloudUpload: CloudUpload,
  currency: Currency, money: CurrencyDollar, dashboard: Dashboard,
  database: DataBase, dataVisualization: DataVis_4, delivery: Delivery, document: Document,
  documents: DocumentMultiple_01, pdf: DocumentPdf, tasks: DocumentTasks,
  documentView: DocumentView, download: Download, edit: Edit, email: Email,
  filter: Filter, folder: Folder, globe: Globe, information: Information, link: Link,
  location: Location, model: MachineLearningModel, magicWand: MagicWand,
  map: Map, modelBuilder: ModelBuilder, network: Network_4, notebook: Notebook,
  notification: Notification, package: Package, appearance: PaintBrush,
  phone: Phone, play: Play, product: Product, refresh: Renew, save: Save,
  search: Search, locateSearch: SearchLocate, reset: Reset, security: Security, send: Send,
  settings: Settings, adjust: SettingsAdjust, share: Share,
  shoppingCart: ShoppingCart, star: Star, task: Task, taskComplete: TaskComplete,
  template: Template, time: Time, tools: Tools, translate: Translate, subtract: Subtract,
  delete: TrashCan, upload: Upload, user: User, avatar: UserAvatar,
  userFollow: UserFollow, users: UserMultiple, userSettings: UserSettings,
  view: View, viewOff: ViewOff, wallet: Wallet, warning: WarningAlt,
  overflow: OverflowMenuVertical, error: ErrorFilled, workspace: Workspace,
  weatherSun: Sun, weatherMoon: Moon, weatherCloudy: Cloudy,
  weatherPartlyCloudy: PartlyCloudy, weatherFog: Fog, weatherRain: Rain,
  weatherSnow: Snow, weatherThunderstorm: Thunderstorm, temperature: Temperature,
} as const;

export type SemanticIconName = keyof typeof semanticIcons;
