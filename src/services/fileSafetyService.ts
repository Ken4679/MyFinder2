import { FileSafetyInfo, FileSafetyLevel } from '../types';

export const FILE_SAFETY_DATABASE: Record<string, FileSafetyInfo> = {
  // 🟢 常用安全办公与用户文档
  '.docx': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: 'Microsoft Word 办公文档',
    description: '您日常打字、写报告、写总结创建的文档，里面存着您输入的文字和插图。',
    deletionSafety: '✅ 可以安全删除。删除它只会丢失这份文档本身的内容，绝不会对 Windows 操作系统或电脑硬件造成任何损坏。',
    openRecommendation: '推荐使用 Microsoft Office Word、WPS Office 或 Windows 自带写字板打开。',
    isSystemCritical: false,
    commonExamples: ['工作总结.docx', '合同草案.docx', '论文初稿.docx']
  },
  '.doc': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: 'Word 97-2003 旧版文档',
    description: '早期版本的 Word 文档格式，兼容性极好，包含文字和格式排版。',
    deletionSafety: '✅ 可以安全删除。若确认不再需要文档内容可直接删除，对电脑系统无任何影响。',
    openRecommendation: '使用 Microsoft Word 或 WPS Office 打开。',
    isSystemCritical: false,
    commonExamples: ['会议纪要.doc', '个人简历.doc']
  },
  '.xlsx': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: 'Microsoft Excel 电子表格',
    description: '用于做账、统计数据、列清单和计算公式的表格文件。',
    deletionSafety: '✅ 可以安全删除。删除只会移除该表格数据，不会影响系统正常运行。',
    openRecommendation: '使用 Microsoft Excel 或 WPS 表格打开。',
    isSystemCritical: false,
    commonExamples: ['财务预算.xlsx', '客户名单.xlsx', '考勤表.xlsx']
  },
  '.xls': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: 'Excel 97-2003 旧版表格',
    description: '旧版 Excel 表格，常用于保存日常报表和账目。',
    deletionSafety: '✅ 可以安全删除。确认数据无用后可放心删除。',
    openRecommendation: '使用 Microsoft Excel 或 WPS 表格打开。',
    isSystemCritical: false,
    commonExamples: ['月度支出.xls', '库存记录.xls']
  },
  '.pptx': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: 'PowerPoint 演示文稿 (PPT)',
    description: '用于开会汇报、演讲展示和教学演示的幻灯片文件。',
    deletionSafety: '✅ 可以安全删除。删除不影响操作系统。',
    openRecommendation: '使用 Microsoft PowerPoint 或 WPS 演示打开。',
    isSystemCritical: false,
    commonExamples: ['项目路演.pptx', '培训讲义.pptx']
  },
  '.ppt': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: 'PowerPoint 旧版幻灯片',
    description: '旧版 PPT 幻灯片演示文件。',
    deletionSafety: '✅ 可以安全删除。删除不会损坏电脑。',
    openRecommendation: '使用 PowerPoint 或 WPS 打开。',
    isSystemCritical: false,
    commonExamples: ['年终总结.ppt']
  },
  '.pdf': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: 'PDF 便携式电子文档',
    description: '排版固定、跨设备显示完全一致的电子书或合同文档，内容不易被随意篡改。',
    deletionSafety: '✅ 可以安全删除。纯属用户资料，删除对电脑没有任何危害。',
    openRecommendation: '使用 Edge 浏览器、Chrome、Adobe Acrobat Reader 或微信/WPS 打开。',
    isSystemCritical: false,
    commonExamples: ['用户手册.pdf', '电子发票.pdf', '签署合同.pdf']
  },
  '.txt': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: '纯文本文件',
    description: '最简单轻巧的记事本文件，只保存纯文字，不包含花哨排版，极度安全。',
    deletionSafety: '✅ 可以安全删除。删除仅损失记下的文字，完全不影响电脑系统。',
    openRecommendation: '直接双击用 Windows 自带“记事本”打开。',
    isSystemCritical: false,
    commonExamples: ['随手笔记.txt', '备忘录.txt', 'readme.txt']
  },
  '.md': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: 'Markdown 轻量标记文档',
    description: '程序员和技术写作者最喜欢的轻量级文档，用简洁符号排版大标题、列表和代码。',
    deletionSafety: '✅ 可以安全删除。纯文本内容，删除不会弄坏电脑。',
    openRecommendation: '使用 Typora、VS Code 或记事本打开。',
    isSystemCritical: false,
    commonExamples: ['README.md', '开发笔记.md']
  },

  // 🟢 图片与多媒体
  '.png': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: 'PNG 高清透明图片',
    description: '支持透明背景的无损高清图片，常见于截图、设计稿、图标和照片。',
    deletionSafety: '✅ 可以安全删除。删除只会删除该照片，不会影响任何系统功能。',
    openRecommendation: '使用 Windows 自带“照片”查看器或任何看图软件打开。',
    isSystemCritical: false,
    commonExamples: ['屏幕截图.png', '商品主图.png', '头像.png']
  },
  '.jpg': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: 'JPEG/JPG 标准照片',
    description: '手机、相机拍摄照片最常用的压缩格式，色彩丰富且体积小。',
    deletionSafety: '✅ 可以安全删除。确认不是珍贵纪念照片后可随时删除。',
    openRecommendation: '使用 Windows 照片查看器直接双击浏览。',
    isSystemCritical: false,
    commonExamples: ['风景照.jpg', '旅游合影.jpg']
  },
  '.jpeg': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: 'JPEG 高保真照片',
    description: '与 .jpg 完全相同，属于标准的照片格式。',
    deletionSafety: '✅ 可以安全删除。',
    openRecommendation: '双击使用系统看图软件查看。',
    isSystemCritical: false,
    commonExamples: ['IMG_2025.jpeg']
  },
  '.mp4': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: 'MP4 通用视频文件',
    description: '全球最主流的视频格式，能在手机、电脑、电视和所有播放器上流畅播放。',
    deletionSafety: '✅ 可以安全删除。视频文件通常占用几个 G 的大空间，确认不要后删除可大幅释放硬盘。',
    openRecommendation: '使用 PotPlayer、VLC 播放器或 Windows 媒体播放器。',
    isSystemCritical: false,
    commonExamples: ['录屏演示.mp4', '电影.mp4', '活动录像.mp4']
  },
  '.mp3': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: 'MP3 流行音频音乐',
    description: '标准的音乐、录音或播客音频文件。',
    deletionSafety: '✅ 可以安全删除。删除不影响系统。',
    openRecommendation: '使用网易云音乐、QQ音乐或 Windows 媒体播放器打开。',
    isSystemCritical: false,
    commonExamples: ['背景音乐.mp3', '录音记录.mp3']
  },
  '.zip': {
    level: 'safe',
    levelBadge: '🟢 放心使用',
    typeName: 'ZIP 压缩文件包',
    description: '将多个文件打包压缩成一个文件的“数字包裹”，能节省空间并方便通过微信/邮件发送。',
    deletionSafety: '✅ 若已解压出里面的文件，压缩包本身可以安全删除，对电脑无害。',
    openRecommendation: '在 Windows 中直接右键选择“解压到当前文件夹”或使用 7-Zip/Bandizip。',
    isSystemCritical: false,
    commonExamples: ['资料汇总.zip', '素材包.zip']
  },

  // 🟡 配置文件、日志与脚本（需谨慎）
  '.json': {
    level: 'caution',
    levelBadge: '🟡 谨慎操作',
    typeName: 'JSON 软件配置文件 / 数据包',
    description: '软件用来记录您的使用偏好、账号状态或窗口布局的结构化纯文本数据。',
    deletionSafety: '⚠️ 若位于您自己的项目文件夹中可以删除；若位于某个软件的安装目录，删除后该软件的配置可能会重置为默认值。',
    openRecommendation: '使用记事本或 VS Code 查看，小白请勿随意修改里面的代码符号。',
    isSystemCritical: false,
    commonExamples: ['package.json', 'settings.json', 'config.json']
  },
  '.ini': {
    level: 'caution',
    levelBadge: '🟡 谨慎操作',
    typeName: 'INI 经典软件初始化配置文件',
    description: 'Windows 经典配置文件，存放软件的各种开关和路径设置。',
    deletionSafety: '⚠️ 尽量不要随意删除。删除可能导致相关联的绿色软件打不开或语言变成英文。',
    openRecommendation: '使用 Windows 记事本打开查看。',
    isSystemCritical: false,
    commonExamples: ['desktop.ini', 'config.ini']
  },
  '.log': {
    level: 'caution',
    levelBadge: '🟡 谨慎操作',
    typeName: 'LOG 软件运行日志记录',
    description: '软件或系统运行时自动记录的“日记账”，记录了何时启动、报了什么错。',
    deletionSafety: '✅ 通常可以删除。日志文件只是记录历史，删除了不影响软件运行，还能腾出空间。',
    openRecommendation: '使用记事本打开查看错误信息。',
    isSystemCritical: false,
    commonExamples: ['app.log', 'error.log', 'install.log']
  },
  '.tmp': {
    level: 'caution',
    levelBadge: '🟡 谨慎操作',
    typeName: 'TMP 临时暂存文件',
    description: '软件在处理大任务或下载时临时写在硬盘上的草稿纸，软件关闭后通常无用。',
    deletionSafety: '✅ 如果软件已经关闭，临时文件可以放心清理，删除它有助于释放电脑磁盘。',
    openRecommendation: '无需打开，直接作为垃圾文件清理即可。',
    isSystemCritical: false,
    commonExamples: ['~WRL0001.tmp', 'cache.tmp']
  },
  '.bak': {
    level: 'caution',
    levelBadge: '🟡 谨慎操作',
    typeName: 'BAK 自动备份文件',
    description: '软件（如 CAD、数据库或文本编辑器）在修改前自动帮您存下的旧版本备份。',
    deletionSafety: '✅ 只要您当前的最新文件正常完好，备份文件可以安全删除。',
    openRecommendation: '如果主文件损坏，可将其后缀改为原扩展名恢复。',
    isSystemCritical: false,
    commonExamples: ['project.bak', 'database.bak']
  },
  '.bat': {
    level: 'caution',
    levelBadge: '🟡 谨慎操作',
    typeName: 'BAT 批处理自动化脚本',
    description: '包含多条 Windows 指令的小脚本，双击会依次自动执行命令（例如启动某个服务或重命名文件）。',
    deletionSafety: '⚠️ 请务必确认来源！如果是您自己写的可以随意处置；若是网上下载的不明脚本，千万不要随意双击运行！',
    openRecommendation: '右键点击选择“编辑”（用记事本看代码），看懂之前不要直接双击运行。',
    isSystemCritical: false,
    commonExamples: ['start.bat', 'build.bat', 'clean.bat']
  },

  // 🔴 核心系统组件与高危二进制文件（严禁删除或盲目双击）
  '.dll': {
    level: 'danger',
    levelBadge: '🔴 系统与软件核心库（严禁乱删）',
    typeName: '动态链接库 (Dynamic Link Library)',
    description: '多个软件和 Windows 操作系统共用的功能积木库（如声音解码、图像渲染组件）。',
    deletionSafety: '🚫 绝对不要删除！尤其是位于 C:\\Windows\\System32 或软件目录中的 DLL，删除会导致软件报“缺少某个.dll无法启动”甚至系统崩溃！',
    openRecommendation: '属于二进制代码文件，普通用户不可读，无需打开。',
    isSystemCritical: true,
    commonExamples: ['kernel32.dll', 'vcruntime140.dll', 'user32.dll']
  },
  '.sys': {
    level: 'danger',
    levelBadge: '🔴 Windows 操作系统底层驱动（严禁触碰）',
    typeName: '系统底层驱动核心文件',
    description: '让显卡、声卡、键盘、主板与 Windows 沟通的生命线程序，是系统最底层的血液。',
    deletionSafety: '🚫 绝对严禁删除！删除哪怕一个系统级 .sys 文件，电脑重启很可能直接遭遇“蓝屏死机”无法开机！',
    openRecommendation: '系统保护文件，请勿尝试打开或修改。',
    isSystemCritical: true,
    commonExamples: ['ntfs.sys', 'nvlddmkm.sys', 'tcpip.sys']
  },
  '.exe': {
    level: 'danger',
    levelBadge: '🔴 可执行安装/主程序（谨慎运行）',
    typeName: 'Windows 应用程序可执行文件',
    description: '双击就能直接在电脑上运行的完整软件主程序或安装向导。',
    deletionSafety: '⚠️ 若是您自己下载安装包，删除只会丢失安装包；若是在软件安装目录中，删除会导致该软件无法启动。从网络陌生人处收到的 .exe 绝不可盲目双击（防病毒）。',
    openRecommendation: '确认是知名安全软件后双击启动；如不信任可先用杀毒软件扫描。',
    isSystemCritical: false,
    commonExamples: ['chrome.exe', 'WeChat.exe', 'Setup.exe']
  },
  '.msi': {
    level: 'danger',
    levelBadge: '🔴 Windows 官方安装程序包',
    typeName: 'Windows Installer 安装数据包',
    description: '包含软件全部组件的安装包，双击会自动向电脑注册并安装软件。',
    deletionSafety: '✅ 安装完成后，位于“下载”文件夹里的 .msi 安装包可以删除腾出空间。',
    openRecommendation: '双击进行软件安装。',
    isSystemCritical: false,
    commonExamples: ['nodejs-setup.msi', 'python-installer.msi']
  },
  '.reg': {
    level: 'danger',
    levelBadge: '🔴 Windows 注册表脚本（极高风险）',
    typeName: 'Windows 注册表配置注入文件',
    description: '能直接修改 Windows 最核心注册表数据库的脚本。',
    deletionSafety: '⚠️ 可以删除该文件本身。但千万不要随意双击“导入”，可能导致系统设置错乱！',
    openRecommendation: '右键用记事本查看里面的键值，非专业人员请勿点击“合并”。',
    isSystemCritical: true,
    commonExamples: ['fix_icon.reg', 'enable_dark.reg']
  },
  '.dat': {
    level: 'danger',
    levelBadge: '🔴 二进制核心数据文件',
    typeName: '系统或游戏加密专用数据文件',
    description: '存放不可读二进制专用数据（如游戏存档、软件密钥、系统配置）。',
    deletionSafety: '🚫 位于系统盘或软件目录下的 .dat 严禁乱删，可能造成存档丢失或无法登录。',
    openRecommendation: '专属于特定软件，通常无法用普通软件正常打开。',
    isSystemCritical: true,
    commonExamples: ['system.dat', 'savegame.dat']
  }
};

/**
 * Checks whether a given folder or file path belongs to a critical Windows system location
 */
export function isSystemCriticalPath(path: string): boolean {
  if (!path) return false;
  const p = path.toLowerCase().replace(/\//g, '\\');
  const criticalPrefixes = [
    'c:\\windows',
    'c:\\windows\\system32',
    'c:\\windows\\syswow64',
    'c:\\program files\\windowsapps',
    'c:\\system volume information',
    'c:\\$recycle.bin',
    'c:\\boot',
    'c:\\recovery'
  ];
  return criticalPrefixes.some(prefix => p.startsWith(prefix) || p === prefix);
}

/**
 * Returns complete safety metadata and layman-friendly advice for any file extension or path
 */
export function getFileSafetyInfo(extension: string, fullPath?: string): FileSafetyInfo {
  const ext = (extension || '').toLowerCase().trim();
  const normalizedExt = ext.startsWith('.') ? ext : `.${ext}`;

  // Check if located in Windows critical directories
  const isProtectedPath = fullPath ? isSystemCriticalPath(fullPath) : false;

  if (FILE_SAFETY_DATABASE[normalizedExt]) {
    const info = { ...FILE_SAFETY_DATABASE[normalizedExt] };
    if (isProtectedPath) {
      info.level = 'danger';
      info.levelBadge = '🔴 系统保护目录文件（绝对不可删除）';
      info.isSystemCritical = true;
      info.deletionSafety = '🚫 此文件位于 Windows 核心系统目录中！绝对禁止删除或改动，否则可能导致电脑无法开机！';
    }
    return info;
  }

  // Fallback for unknown extensions
  if (isProtectedPath) {
    return {
      level: 'danger',
      levelBadge: '🔴 系统保护文件',
      typeName: `${normalizedExt} 系统文件`,
      description: '位于 Windows 核心系统保护目录中的未知类型文件。',
      deletionSafety: '🚫 位于 Windows 核心系统目录中，绝对严禁删除！',
      openRecommendation: '系统核心文件，请勿随意改动。',
      isSystemCritical: true,
      commonExamples: []
    };
  }

  return {
    level: 'safe',
    levelBadge: '🟢 一般文件',
    typeName: `${normalizedExt.toUpperCase()} 文件`,
    description: '常规电脑文件。只要不是在系统核心目录下，属于您个人或应用产生的数据。',
    deletionSafety: '✅ 只要您确认不再需要该文件里面的内容，可以安全删除。删除它不会损坏 Windows 操作系统。',
    openRecommendation: '可尝试使用记事本、对应应用软件或系统关联默认程序打开。',
    isSystemCritical: false,
    commonExamples: []
  };
}
