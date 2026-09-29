using MediaBrowser.Model.Plugins;

namespace Jellyfin.Plugin.LanguageBadges.Configuration;

public class PluginConfiguration : BasePluginConfiguration
{
    /// <summary>Paint badges on poster cards and list rows.</summary>
    public bool ShowOnCards { get; set; } = true;

    /// <summary>Paint a badge row on the item detail page.</summary>
    public bool ShowOnDetailPage { get; set; } = true;

    /// <summary>Also show subtitle languages (on cards only those not already available as audio).</summary>
    public bool ShowSubtitles { get; set; } = true;

    /// <summary>Aggregate episode languages for Series/Season cards (costs one DB query per series, cached).</summary>
    public bool ShowOnSeries { get; set; } = true;

    /// <summary>Comma separated badge codes painted with the highlight colour (the languages you care most about).</summary>
    public string HighlightCodes { get; set; } = "ES,LAT";

    /// <summary>Max audio languages drawn on a card before collapsing into "+N".</summary>
    public int MaxCardLanguages { get; set; } = 3;

    /// <summary>
    /// Words that, found in the title of a Spanish audio track, mark it as Latin-American Spanish (badge LAT instead of ES).
    /// </summary>
    public string LatinoKeywords { get; set; } = "latino,latam,latinoamerica,latinoamericano,mexico,mexicano,es-419,es-mx";
}
