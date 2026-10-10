using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.JellyAsk;

public class PluginConfiguration : BasePluginConfiguration
{
    public string TelegramBotToken { get; set; } = string.Empty;

    public string TelegramChatId { get; set; } = string.Empty;
}
