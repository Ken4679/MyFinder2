using MyFinder.Models.Base;

namespace MyFinder.Models.Entities;

public class SearchHistoryRecord : BaseEntity
{
    public string QueryText { get; set; } = string.Empty;
    public string SearchType { get; set; } = string.Empty;
}
