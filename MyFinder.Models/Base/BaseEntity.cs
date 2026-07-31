namespace MyFinder.Models.Base;

public abstract class BaseEntity
{
    public long Id { get; set; }
    public DateTime CreatedTime { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedTime { get; set; } = DateTime.UtcNow;
}
