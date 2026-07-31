namespace MyFinder.Core.Interfaces;

public interface IDialogService
{
    Task<bool> ShowConfirmationAsync(string title, string content, string confirmText = "确定", string cancelText = "取消");
    Task ShowMessageAsync(string title, string content, string buttonText = "确定");
    Task<bool> ShowProgressAsync(string title, string content, Func<IProgress<string>, CancellationToken, Task<bool>> action);

    /// <summary>
    /// 显示多选文件夹对话框，让用户批量选择目录
    /// </summary>
    /// <returns>用户选中的文件夹路径列表，如果取消则返回空列表</returns>
    Task<List<string>> ShowMultiFolderPickerAsync();
}