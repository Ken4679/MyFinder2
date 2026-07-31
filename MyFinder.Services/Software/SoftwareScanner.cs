using System.Diagnostics;
using System.IO;
using System.Runtime.Versioning;
using System.Security.Cryptography.X509Certificates;
using Microsoft.Win32;
using MyFinder.Core.Interfaces;
using MyFinder.Models.Entities;

namespace MyFinder.Services.Software;

[SupportedOSPlatform("windows")]
public class SoftwareScanner : ISoftwareScanner
{
    private readonly ISecurityAuditLogger _logger;

    public SoftwareScanner(ISecurityAuditLogger logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public Task<IEnumerable<SoftwareRecord>> ScanInstalledSoftwareAsync()
    {
        return Task.Run(() =>
        {
            var softwareList = new Dictionary<string, SoftwareRecord>(StringComparer.OrdinalIgnoreCase);

            ScanRegistryHive(RegistryHive.LocalMachine, RegistryView.Registry64, softwareList);
            ScanRegistryHive(RegistryHive.LocalMachine, RegistryView.Registry32, softwareList);
            ScanRegistryHive(RegistryHive.CurrentUser, RegistryView.Registry64, softwareList);
            ScanRegistryHive(RegistryHive.CurrentUser, RegistryView.Registry32, softwareList);

            ScanStartMenuShortcuts(softwareList);

            return softwareList.Values.AsEnumerable();
        });
    }

    private void ScanRegistryHive(RegistryHive hive, RegistryView view, Dictionary<string, SoftwareRecord> list)
    {
        try
        {
            using var baseKey = RegistryKey.OpenBaseKey(hive, view);
            using var uninstallKey = baseKey.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall");
            if (uninstallKey == null) return;

            foreach (var subKeyName in uninstallKey.GetSubKeyNames())
            {
                try
                {
                    using var subKey = uninstallKey.OpenSubKey(subKeyName);
                    if (subKey == null) continue;

                    var displayName = subKey.GetValue("DisplayName")?.ToString()?.Trim();
                    if (string.IsNullOrEmpty(displayName)) continue;

                    var installLocation = subKey.GetValue("InstallLocation")?.ToString()?.Trim() ?? string.Empty;
                    var publisher = subKey.GetValue("Publisher")?.ToString()?.Trim() ?? "未知发布商";
                    var version = subKey.GetValue("DisplayVersion")?.ToString()?.Trim() ?? "1.0.0";
                    var displayIcon = subKey.GetValue("DisplayIcon")?.ToString()?.Trim() ?? string.Empty;

                    string mainExePath = ExtractExecutablePath(displayIcon, installLocation);

                    if (!list.ContainsKey(displayName))
                    {
                        var (isSigned, signer) = GetFileSignature(mainExePath);

                        var record = new SoftwareRecord
                        {
                            DisplayName = displayName,
                            Publisher = publisher,
                            Version = version,
                            InstallLocation = installLocation,
                            MainExePath = mainExePath,
                            IsSigned = isSigned,
                            SignerName = signer,
                            CreatedTime = DateTime.UtcNow,
                            UpdatedTime = DateTime.UtcNow
                        };

                        if (!string.IsNullOrEmpty(mainExePath) && File.Exists(mainExePath))
                        {
                            try
                            {
                                var versionInfo = FileVersionInfo.GetVersionInfo(mainExePath);
                                if (!string.IsNullOrEmpty(versionInfo.CompanyName))
                                {
                                    record.Publisher = versionInfo.CompanyName;
                                }
                            }
                            catch { }
                        }

                        list[displayName] = record;
                    }
                }
                catch { }
            }
        }
        catch { }
    }

    private void ScanStartMenuShortcuts(Dictionary<string, SoftwareRecord> list)
    {
        var startMenuPaths = new[]
        {
            Environment.GetFolderPath(Environment.SpecialFolder.CommonPrograms),
            Environment.GetFolderPath(Environment.SpecialFolder.Programs)
        };

        foreach (var startPath in startMenuPaths)
        {
            if (string.IsNullOrEmpty(startPath) || !Directory.Exists(startPath)) continue;

            try
            {
                var exeFiles = Directory.GetFiles(startPath, "*.exe", SearchOption.AllDirectories);
                foreach (var exe in exeFiles)
                {
                    try
                    {
                        var info = new FileInfo(exe);
                        var name = Path.GetFileNameWithoutExtension(info.Name);
                        if (!list.ContainsKey(name) && !name.Equals("Uninstall", StringComparison.OrdinalIgnoreCase))
                        {
                            var (isSigned, signer) = GetFileSignature(exe);
                            var versionInfo = FileVersionInfo.GetVersionInfo(exe);
                            
                            list[name] = new SoftwareRecord
                            {
                                DisplayName = name,
                                Publisher = !string.IsNullOrEmpty(versionInfo.CompanyName) ? versionInfo.CompanyName : "未知发布商",
                                Version = !string.IsNullOrEmpty(versionInfo.FileVersion) ? versionInfo.FileVersion : "1.0.0",
                                InstallLocation = info.DirectoryName ?? string.Empty,
                                MainExePath = exe,
                                IsSigned = isSigned,
                                SignerName = signer,
                                CreatedTime = DateTime.UtcNow,
                                UpdatedTime = DateTime.UtcNow
                            };
                        }
                    }
                    catch { }
                }
            }
            catch { }
        }
    }

    private static string ExtractExecutablePath(string displayIcon, string installLocation)
    {
        if (!string.IsNullOrEmpty(displayIcon))
        {
            int commaIdx = displayIcon.LastIndexOf(',');
            string iconPath = commaIdx > 0 ? displayIcon.Substring(0, commaIdx).Trim('"') : displayIcon.Trim('"');

            if (File.Exists(iconPath) && iconPath.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
            {
                return iconPath;
            }
        }

        if (!string.IsNullOrEmpty(installLocation) && Directory.Exists(installLocation))
        {
            try
            {
                var exeFiles = Directory.GetFiles(installLocation, "*.exe", SearchOption.TopDirectoryOnly);
                if (exeFiles.Length > 0)
                {
                    return exeFiles[0];
                }
            }
            catch { }
        }

        return string.Empty;
    }

    private static (bool IsSigned, string Signer) GetFileSignature(string filePath)
    {
        if (string.IsNullOrEmpty(filePath) || !File.Exists(filePath))
            return (false, string.Empty);

        try
        {
            using var cert = X509Certificate.CreateFromSignedFile(filePath);
            if (cert == null) return (false, string.Empty);

            using var cert2 = new X509Certificate2(cert);
            string signerName = cert2.GetNameInfo(X509NameType.SimpleName, false);
            if (string.IsNullOrEmpty(signerName))
            {
                signerName = cert2.Subject;
            }

            return (true, signerName ?? "已签名");
        }
        catch
        {
            return (false, string.Empty);
        }
    }
}