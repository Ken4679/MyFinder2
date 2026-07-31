using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using MyFinder.Core.Interfaces;
using System;
using System.Collections.Generic;
using System.Threading;
using System.Threading.Tasks;

namespace MyFinder.UI.Services;

public class DialogService : IDialogService
{
    public async Task<bool> ShowConfirmAsync(string title, string content, string primaryButtonText = "确定", string secondaryButtonText = "取消")
    {
        var dialog = new ContentDialog
        {
            Title = title,
            Content = content,
            PrimaryButtonText = primaryButtonText,
            SecondaryButtonText = secondaryButtonText,
            XamlRoot = App.MainWindow?.Content?.XamlRoot
        };
        var result = await dialog.ShowAsync();
        return result == ContentDialogResult.Primary;
    }

    public async Task<bool> ShowConfirmationAsync(string title, string content, string primaryButtonText = "确定", string secondaryButtonText = "取消")
        => await ShowConfirmAsync(title, content, primaryButtonText, secondaryButtonText);

    public async Task ShowMessageAsync(string title, string content, string closeButtonText = "确定")
    {
        var dialog = new ContentDialog
        {
            Title = title,
            Content = content,
            CloseButtonText = closeButtonText,
            XamlRoot = App.MainWindow?.Content?.XamlRoot
        };
        await dialog.ShowAsync();
    }

    public async Task<bool> ShowProgressAsync(string title, string message, Func<IProgress<string>, CancellationToken, Task<bool>> workItem)
    {
        var cts = new CancellationTokenSource();
        var progress = new Progress<string>();
        return await workItem(progress, cts.Token);
    }

    public async Task<List<string>> ShowMultiFolderPickerAsync()
    {
        // 功能已移除，返回空列表
        return await Task.FromResult(new List<string>());
    }
}
