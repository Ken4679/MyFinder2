namespace MyFinder.Models.Entities;

public class NaturalLanguageQueryResult
{
    public string OriginalQuery { get; set; } = string.Empty;
    public string ExtractedSearchText { get; set; } = string.Empty;
    public int? TargetCategory { get; set; }
    public string? TargetExtension { get; set; }
    public DateTime? StartDate { get; set; }
    public DateTime? EndDate { get; set; }
    public bool IsNaturalLanguage { get; set; }
    public string ParsedDescription { get; set; } = string.Empty;
}
