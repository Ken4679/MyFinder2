using MyFinder.Models.Base;

namespace MyFinder.Models.Entities;

public class FileRecord : BaseEntity
{
    public string Path { get; set; } = string.Empty;
    public string FileName { get; set; } = string.Empty;
    public string Extension { get; set; } = string.Empty;
    public long SizeBytes { get; set; }
    public int Category { get; set; }
}
