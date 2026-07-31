using MyFinder.Models.Base;

namespace MyFinder.Models.Entities;

public class FavoriteRecord : BaseEntity
{
    public string TargetPath { get; set; } = string.Empty;
    public int TargetType { get; set; }
    public string DisplayAlias { get; set; } = string.Empty;
}
