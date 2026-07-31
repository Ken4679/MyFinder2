using System;

namespace MyFinder.Core.Exceptions;

public class DataStoreException : Exception
{
    public string UserFriendlyMessage { get; }

    public DataStoreException(string message, string userFriendlyMessage, Exception? innerException = null)
        : base(message, innerException)
    {
        UserFriendlyMessage = userFriendlyMessage;
    }

    public DataStoreException(string userFriendlyMessage)
        : base(userFriendlyMessage)
    {
        UserFriendlyMessage = userFriendlyMessage;
    }
}
