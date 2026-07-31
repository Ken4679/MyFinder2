namespace MyFinder.Models;

public class StartupResult
{
    public bool IsSuccess { get; }
    public string ErrorCode { get; }
    public string UserFriendlyMessage { get; }

    private StartupResult(bool isSuccess, string errorCode, string userFriendlyMessage)
    {
        IsSuccess = isSuccess;
        ErrorCode = errorCode;
        UserFriendlyMessage = userFriendlyMessage;
    }

    public static StartupResult Success() => new(true, string.Empty, string.Empty);

    public static StartupResult Failure(string errorCode, string userFriendlyMessage) =>
        new(false, errorCode, userFriendlyMessage);
}
