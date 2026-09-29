using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.SearchNotifier.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Master switch for logging searches.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>URL that receives a JSON POST per search. Empty = log only.</summary>
    public string WebhookUrl { get; set; } = string.Empty;

    /// <summary>
    /// Optional. When set, it is added to the payload as "chat_id", which makes the payload directly valid for
    /// Telegram's https://api.telegram.org/bot&lt;TOKEN&gt;/sendMessage (it only reads chat_id + text).
    /// </summary>
    public string TelegramChatId { get; set; } = string.Empty;

    /// <summary>Only notify (webhook) searches that returned nothing: "someone wants X and it is not in the library".</summary>
    public bool NotifyOnlyNoResults { get; set; }

    /// <summary>
    /// Clients search while the user types ("m", "ma", "mat"...) and fire several parallel requests per term.
    /// A search is considered finished after this many seconds without new requests from that user.
    /// </summary>
    public int DebounceSeconds { get; set; } = 4;

    /// <summary>Ignore terms shorter than this.</summary>
    public int MinTermLength { get; set; } = 2;

    /// <summary>Comma separated user names that are never logged (e.g. the admin while testing).</summary>
    public string ExcludedUsers { get; set; } = string.Empty;

    /// <summary>How many searches the log keeps.</summary>
    public int MaxLogEntries { get; set; } = 2000;
}
