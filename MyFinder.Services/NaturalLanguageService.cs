using System.Text.RegularExpressions;
using MyFinder.Core.Interfaces;
using MyFinder.Models.Entities;

namespace MyFinder.Services;

public class NaturalLanguageService : INaturalLanguageService
{
    public NaturalLanguageQueryResult ParseQuery(string input)
    {
        var result = new NaturalLanguageQueryResult
        {
            OriginalQuery = input ?? string.Empty
        };

        if (string.IsNullOrWhiteSpace(input))
            return result;

        var text = input.Trim();
        var descriptions = new List<string>();

        // 1. 时间实体解析
        var now = DateTime.Now;
        if (text.Contains("今天") || text.Contains("today"))
        {
            result.StartDate = now.Date;
            result.EndDate = now.Date.AddDays(1).AddTicks(-1);
            descriptions.Add("时间: 今天");
            text = Regex.Replace(text, @"今天|today", "", RegexOptions.IgnoreCase);
        }
        else if (text.Contains("昨天") || text.Contains("yesterday"))
        {
            result.StartDate = now.Date.AddDays(-1);
            result.EndDate = now.Date.AddTicks(-1);
            descriptions.Add("时间: 昨天");
            text = Regex.Replace(text, @"昨天|yesterday", "", RegexOptions.IgnoreCase);
        }
        else if (text.Contains("本周") || text.Contains("这周") || text.Contains("this week"))
        {
            int diff = (7 + (now.DayOfWeek - DayOfWeek.Monday)) % 7;
            result.StartDate = now.Date.AddDays(-1 * diff);
            result.EndDate = now;
            descriptions.Add("时间: 本周");
            text = Regex.Replace(text, @"本周|这周|this week", "", RegexOptions.IgnoreCase);
        }
        else if (text.Contains("上周") || text.Contains("last week"))
        {
            int diff = (7 + (now.DayOfWeek - DayOfWeek.Monday)) % 7;
            var endOfLastWeek = now.Date.AddDays(-1 * diff).AddTicks(-1);
            result.StartDate = endOfLastWeek.Date.AddDays(-6);
            result.EndDate = endOfLastWeek;
            descriptions.Add("时间: 上周");
            text = Regex.Replace(text, @"上周|last week", "", RegexOptions.IgnoreCase);
        }
        else if (text.Contains("本月") || text.Contains("this month"))
        {
            result.StartDate = new DateTime(now.Year, now.Month, 1);
            result.EndDate = now;
            descriptions.Add("时间: 本月");
            text = Regex.Replace(text, @"本月|this month", "", RegexOptions.IgnoreCase);
        }

        // 2. 文件分类解析
        if (Regex.IsMatch(text, @"图片|照片|图像|image|photo|jpg|png|gif", RegexOptions.IgnoreCase))
        {
            result.TargetCategory = 2; // Image
            descriptions.Add("类型: 图片");
            text = Regex.Replace(text, @"图片|照片|图像|image|photo", "", RegexOptions.IgnoreCase);
        }
        else if (Regex.IsMatch(text, @"文档|文件|word|excel|ppt|pdf|txt|markdown|md|doc|docx", RegexOptions.IgnoreCase))
        {
            result.TargetCategory = 1; // Document
            descriptions.Add("类型: 文档");
            text = Regex.Replace(text, @"文档|文件|document", "", RegexOptions.IgnoreCase);
        }
        else if (Regex.IsMatch(text, @"音频|音乐|歌曲|声音|mp3|wav|flac", RegexOptions.IgnoreCase))
        {
            result.TargetCategory = 3; // Audio
            descriptions.Add("类型: 音频");
            text = Regex.Replace(text, @"音频|音乐|歌曲|声音|audio|music", "", RegexOptions.IgnoreCase);
        }
        else if (Regex.IsMatch(text, @"视频|电影|影片|mp4|mkv|avi", RegexOptions.IgnoreCase))
        {
            result.TargetCategory = 4; // Video
            descriptions.Add("类型: 视频");
            text = Regex.Replace(text, @"视频|电影|影片|video|movie", "", RegexOptions.IgnoreCase);
        }
        else if (Regex.IsMatch(text, @"程序|应用|软件|安装包|exe|msi", RegexOptions.IgnoreCase))
        {
            result.TargetCategory = 5; // Executable
            descriptions.Add("类型: 可执行程序");
            text = Regex.Replace(text, @"程序|应用|软件|安装包", "", RegexOptions.IgnoreCase);
        }

        // 提取剩余的核心搜索关键词
        var remaining = Regex.Replace(text, @"的|关于|查找|搜索|含有|包含|寻找|find|search", "", RegexOptions.IgnoreCase).Trim();
        result.ExtractedSearchText = remaining;

        if (descriptions.Count > 0)
        {
            result.IsNaturalLanguage = true;
            if (!string.IsNullOrEmpty(remaining))
            {
                descriptions.Add($"关键词: \"{remaining}\"");
            }
            result.ParsedDescription = "💡 智能语义理解：" + string.Join(" | ", descriptions);
        }

        return result;
    }
}
