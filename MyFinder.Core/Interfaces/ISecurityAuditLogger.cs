namespace MyFinder.Core.Interfaces;

public interface ISecurityAuditLogger
{
    void LogError(string errorCode, string safeDescription);
    void LogSecurityEvent(string eventCode, string safeDetails);
    void LogUserAction(string actionCode);
}
