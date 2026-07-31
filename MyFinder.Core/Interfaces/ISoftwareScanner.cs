using MyFinder.Models.Entities;

namespace MyFinder.Core.Interfaces;

public interface ISoftwareScanner
{
    Task<IEnumerable<SoftwareRecord>> ScanInstalledSoftwareAsync();
}
