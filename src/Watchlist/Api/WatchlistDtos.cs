namespace Jellyfin.Plugin.Watchlist.Api;

public record WatchlistItemDto(string ItemId, string Name, string Type, int? ProductionYear, bool HasPrimaryImage, string AddedUtc);

public record ItemStatusDto(bool Eligible, bool InWatchlist);
