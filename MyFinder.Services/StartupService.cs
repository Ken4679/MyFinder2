using Microsoft.Win32;
using MyFinder.Core.Interfaces;

namespace MyFinder.Services;

public class StartupService : IStartupService
{
    private readonly ISecurityAuditLogger _logger;
    private const string RegistryKeyPath = @"HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Run";
    private const string AppName = "MyFinder";

    public StartupService(ISecurityAuditLogger logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    public bool IsEnabled()
    {
        try
        {
            var value = Registry.GetValue(RegistryKeyPath, AppName, null) as string;
            return !string.IsNullOrEmpty(value);
        }
        catch (Exception ex)
        {
            _logger.LogError("STARTUP_CHECK_ERROR", $"Failed to check startup status: {ex.Message}");
            return false;
        }
    }

    public void Enable()
    {
        try
        {
            var exePath = Environment.ProcessPath;
            if (string.IsNullOrEmpty(exePath))
                throw new InvalidOperationException("Unable to get executable path");

            Registry.SetValue(RegistryKeyPath, AppName, $"\"{exePath}\"");
            _logger.LogSecurityEvent("STARTUP_ENABLED", "Auto-start enabled in registry");
        }
        catch (UnauthorizedAccessException)
        {
            _logger.LogError("STARTUP_ACCESS_DENIED", "Insufficient permissions to modify registry");
            throw;
        }
        catch (Exception ex)
        {
            _logger.LogError("STARTUP_ENABLE_ERROR", $"Failed to enable auto-start: {ex.Message}");
            throw;
        }
    }

    public void Disable()
    {
        try
        {
            using var key = Registry.CurrentUser.OpenSubKey(@"Software\Microsoft\Windows\CurrentVersion\Run", true);
            if (key != null && key.GetValue(AppName) != null)
            {
                key.DeleteValue(AppName);
                _logger.LogSecurityEvent("STARTUP_DISABLED", "Auto-start disabled in registry");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError("STARTUP_DISABLE_ERROR", $"Failed to disable auto-start: {ex.Message}");
            throw;
        }
    }
}
