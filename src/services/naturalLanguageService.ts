import { NaturalLanguageQueryResult, FileCategory } from '../types';

export function parseNaturalLanguageQuery(input: string): NaturalLanguageQueryResult {
  const result: NaturalLanguageQueryResult = {
    originalQuery: input || '',
    isNaturalLanguage: false,
    extractedSearchText: '',
    parsedDescription: '',
  };

  if (!input || !input.trim()) {
    return result;
  }

  let text = input.trim();
  const descriptions: string[] = [];
  const now = new Date();

  // 1. 时间实体解析
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

  if (/今天|today/i.test(text)) {
    result.startDate = todayStart.toISOString();
    result.endDate = todayEnd.toISOString();
    descriptions.push('时间: 今天');
    text = text.replace(/今天|today/gi, '');
  } else if (/昨天|yesterday/i.test(text)) {
    const yStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);
    const yEnd = new Date(todayStart.getTime() - 1);
    result.startDate = yStart.toISOString();
    result.endDate = yEnd.toISOString();
    descriptions.push('时间: 昨天');
    text = text.replace(/昨天|yesterday/gi, '');
  } else if (/本周|这周|this week/i.test(text)) {
    const day = now.getDay() || 7;
    const weekStart = new Date(todayStart);
    weekStart.setDate(todayStart.getDate() - day + 1);
    result.startDate = weekStart.toISOString();
    result.endDate = now.toISOString();
    descriptions.push('时间: 本周');
    text = text.replace(/本周|这周|this week/gi, '');
  } else if (/上周|last week/i.test(text)) {
    const day = now.getDay() || 7;
    const lastWeekEnd = new Date(todayStart);
    lastWeekEnd.setDate(todayStart.getDate() - day);
    lastWeekEnd.setHours(23, 59, 59, 999);
    const lastWeekStart = new Date(lastWeekEnd);
    lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
    lastWeekStart.setHours(0, 0, 0, 0);

    result.startDate = lastWeekStart.toISOString();
    result.endDate = lastWeekEnd.toISOString();
    descriptions.push('时间: 上周');
    text = text.replace(/上周|last week/gi, '');
  } else if (/本月|this month/i.test(text)) {
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    result.startDate = monthStart.toISOString();
    result.endDate = now.toISOString();
    descriptions.push('时间: 本月');
    text = text.replace(/本月|this month/gi, '');
  }

  // 2. 文件分类解析
  if (/图片|照片|图像|image|photo|jpg|png|gif|webp|svg/i.test(text)) {
    result.targetCategory = FileCategory.Image;
    descriptions.push('类型: 图片');
    text = text.replace(/图片|照片|图像|image|photo/gi, '');
  } else if (/文档|文件|word|excel|ppt|pdf|txt|markdown|md|doc|docx/i.test(text)) {
    result.targetCategory = FileCategory.Document;
    descriptions.push('类型: 文档');
    text = text.replace(/文档|文件|document/gi, '');
  } else if (/音频|音乐|歌曲|声音|mp3|wav|flac/i.test(text)) {
    result.targetCategory = FileCategory.Audio;
    descriptions.push('类型: 音频');
    text = text.replace(/音频|音乐|歌曲|声音|audio|music/gi, '');
  } else if (/视频|电影|影片|mp4|mkv|avi/i.test(text)) {
    result.targetCategory = FileCategory.Video;
    descriptions.push('类型: 视频');
    text = text.replace(/视频|电影|影片|video|movie/gi, '');
  } else if (/程序|应用|软件|安装包|exe|msi/i.test(text)) {
    result.targetCategory = FileCategory.Executable;
    descriptions.push('类型: 可执行程序');
    text = text.replace(/程序|应用|软件|安装包/gi, '');
  }

  // 提取剩余的核心搜索关键词
  const remaining = text.replace(/的|关于|查找|搜索|含有|包含|寻找|find|search/gi, '').trim();
  result.extractedSearchText = remaining;

  if (descriptions.length > 0) {
    result.isNaturalLanguage = true;
    if (remaining) {
      descriptions.push(`关键词: "${remaining}"`);
    }
    result.parsedDescription = '💡 智能语义理解：' + descriptions.join(' | ');
  }

  return result;
}
