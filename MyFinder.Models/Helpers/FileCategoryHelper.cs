namespace MyFinder.Models.Helpers;

public static class FileCategoryHelper
{
    public static int DetermineCategory(string? extension)
    {
        if (string.IsNullOrWhiteSpace(extension))
        {
            return 0;
        }

        return extension.Trim().ToLowerInvariant() switch
        {
            ".doc" or ".docx" or ".xls" or ".xlsx" or ".ppt" or ".pptx" or ".pdf" or ".txt" or ".md" or ".rtf" => 1,
            ".jpg" or ".jpeg" or ".png" or ".gif" or ".bmp" or ".tiff" or ".svg" or ".webp" or ".ico" => 2,
            ".mp3" or ".wav" or ".flac" or ".aac" or ".ogg" or ".m4a" or ".wma" => 3,
            ".mp4" or ".avi" or ".mkv" or ".mov" or ".wmv" or ".flv" or ".webm" => 4,
            ".exe" or ".msi" or ".cmd" or ".bat" or ".dll" or ".sys" or ".ps1" or ".vbs" => 5,
            ".json" or ".xml" or ".ini" or ".cfg" or ".yaml" or ".yml" or ".toml" or ".config" => 6,
            ".tmp" or ".log" or ".bak" or ".old" or ".chk" => 7,
            _ => 0
        };
    }
}
