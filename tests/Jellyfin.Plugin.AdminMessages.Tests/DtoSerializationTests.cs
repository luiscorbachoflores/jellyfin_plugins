using System;
using System.Text.Json;
using Jellyfin.Plugin.AdminMessages.Api;
using Xunit;

namespace Jellyfin.Plugin.AdminMessages.Tests;

public class DtoSerializationTests
{
    [Fact]
    public void AdminMessageDto_SerializesWithPascalCasePropertyNames()
    {
        var dto = new AdminMessageDto(Guid.Parse("11111111-1111-1111-1111-111111111111"), "admin-1", "Título", "Cuerpo", "https://example.com", "2026-01-01T00:00:00.0000000Z", new[] { "alice" });

        var json = JsonSerializer.Serialize(dto);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.Equal("11111111-1111-1111-1111-111111111111", root.GetProperty("Id").GetString());
        Assert.Equal("admin-1", root.GetProperty("AdminUserId").GetString());
        Assert.Equal("Título", root.GetProperty("Title").GetString());
        Assert.Equal("Cuerpo", root.GetProperty("Body").GetString());
        Assert.Equal("https://example.com", root.GetProperty("Link").GetString());
        Assert.Equal("alice", root.GetProperty("TargetUserIds")[0].GetString());
    }

    [Fact]
    public void AdminMessageDto_WithoutLink_SerializesLinkAsNull()
    {
        var dto = new AdminMessageDto(Guid.Parse("11111111-1111-1111-1111-111111111111"), "admin-1", "Título", "Cuerpo", null, "2026-01-01T00:00:00.0000000Z", Array.Empty<string>());

        var json = JsonSerializer.Serialize(dto);
        using var doc = JsonDocument.Parse(json);

        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("Link").ValueKind);
    }

    [Fact]
    public void UserMessageDto_SerializesWithPascalCasePropertyNames()
    {
        var dto = new UserMessageDto(Guid.Parse("22222222-2222-2222-2222-222222222222"), "Título", "Cuerpo", "https://example.com", "2026-01-01T00:00:00.0000000Z", true);

        var json = JsonSerializer.Serialize(dto);
        using var doc = JsonDocument.Parse(json);
        var root = doc.RootElement;

        Assert.Equal("22222222-2222-2222-2222-222222222222", root.GetProperty("Id").GetString());
        Assert.Equal("Título", root.GetProperty("Title").GetString());
        Assert.Equal("https://example.com", root.GetProperty("Link").GetString());
        Assert.True(root.GetProperty("IsRead").GetBoolean());
    }

    [Fact]
    public void UserMessageDto_WithoutLink_SerializesLinkAsNull()
    {
        var dto = new UserMessageDto(Guid.Parse("22222222-2222-2222-2222-222222222222"), "Título", "Cuerpo", null, "2026-01-01T00:00:00.0000000Z", false);

        var json = JsonSerializer.Serialize(dto);
        using var doc = JsonDocument.Parse(json);

        Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("Link").ValueKind);
    }

    [Fact]
    public void CreateMessageDto_DeserializesFromPascalCaseJson()
    {
        var json = "{\"Title\":\"Título\",\"Body\":\"Cuerpo\",\"Link\":\"https://example.com\",\"TargetUserIds\":[\"alice\",\"bob\"]}";

        var dto = JsonSerializer.Deserialize<CreateMessageDto>(json);

        Assert.NotNull(dto);
        Assert.Equal("Título", dto!.Title);
        Assert.Equal("Cuerpo", dto.Body);
        Assert.Equal("https://example.com", dto.Link);
        Assert.Equal(new[] { "alice", "bob" }, dto.TargetUserIds);
    }

    [Fact]
    public void CreateMessageDto_MissingLink_DefaultsToNull()
    {
        var json = "{\"Title\":\"Título\",\"Body\":\"Cuerpo\"}";

        var dto = JsonSerializer.Deserialize<CreateMessageDto>(json);

        Assert.NotNull(dto);
        Assert.Null(dto!.Link);
    }

    [Fact]
    public void CreateMessageDto_MissingTargetUserIds_DefaultsToEmptyList()
    {
        var json = "{\"Title\":\"Título\",\"Body\":\"Cuerpo\"}";

        var dto = JsonSerializer.Deserialize<CreateMessageDto>(json);

        Assert.NotNull(dto);
        Assert.NotNull(dto!.TargetUserIds);
        Assert.Empty(dto.TargetUserIds!);
    }
}
