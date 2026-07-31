using MyFinder.Models.Base;

namespace MyFinder.Models.Entities;

public class SoftwareRecord : BaseEntity
{
    public string DisplayName { get; set; } = string.Empty;
    public string Publisher { get; set; } = string.Empty;
    public string Version { get; set; } = string.Empty;
    public string InstallLocation { get; set; } = string.Empty;
    public string MainExePath { get; set; } = string.Empty;
    public bool IsSigned { get; set; }
    public string SignerName { get; set; } = string.Empty;
}
