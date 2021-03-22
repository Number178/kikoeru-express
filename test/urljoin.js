//eslint-disable-next-line node/no-unpublished-require
const chai = require('chai');
const expect = chai.expect;
const { joinFragments } = require('../routes/utils/url')

describe('joinfragments()', function(){
  it('should return correct offload path for base case', function() {
    const baseUrl = '/media/stream/'
    const rootFolderName = 'VoiceWork'
    const workDir = 'RJ157474'
    const trackSubfolder = ''
    const trackTitle = 't4 おやすみ.mp3'
    if (process.platform === 'win32') {
      expect(joinFragments(baseUrl, rootFolderName, workDir, trackSubfolder, trackTitle)).to.equal(
        '\\media\\stream\\VoiceWork\\RJ157474\\t4 おやすみ.mp3'
      )
    } else {
      expect(joinFragments(baseUrl, rootFolderName, workDir, trackSubfolder, trackTitle)).to.equal(
        '/media/stream/VoiceWork/RJ157474/t4 おやすみ.mp3'
      )
    }
  })

  it('should return correct offload URL for base case', function() {
    const baseUrl = 'https://cdn.example.com/media/stream/'
    const rootFolderName = 'VoiceWork'
    const workDir = 'RJ157474'
    const trackSubfolder = ''
    const trackTitle = 't4 おやすみ.mp3'
    expect(joinFragments(baseUrl, rootFolderName, workDir, trackSubfolder, trackTitle)).to.equal(
      'https://cdn.example.com/media/stream/VoiceWork/RJ157474/t4%20%E3%81%8A%E3%82%84%E3%81%99%E3%81%BF.mp3'
    )
  })

  it('should return correct offload path for baseUrl without trailing slash', function() {
    const baseUrl = '/media/stream'
    const rootFolderName = 'VoiceWork'
    const workDir = 'RJ157474'
    const trackSubfolder = ''
    const trackTitle = 't4 おやすみ.mp3'
    if (process.platform === 'win32') {
      expect(joinFragments(baseUrl, rootFolderName, workDir, trackSubfolder, trackTitle)).to.equal(
        '\\media\\stream\\VoiceWork\\RJ157474\\t4 おやすみ.mp3'
      )
    } else {
      expect(joinFragments(baseUrl, rootFolderName, workDir, trackSubfolder, trackTitle)).to.equal(
        '/media/stream/VoiceWork/RJ157474/t4 おやすみ.mp3'
      )
    }
  })

  it('should return correct offload URL for baseUrl without trailing slash', function() {
    const baseUrl = 'https://cdn.example.com/media/stream'
    const rootFolderName = 'VoiceWork'
    const workDir = 'RJ157474'
    const trackSubfolder = ''
    const trackTitle = 't4 おやすみ.mp3'
    expect(joinFragments(baseUrl, rootFolderName, workDir, trackSubfolder, trackTitle)).to.equal(
      'https://cdn.example.com/media/stream/VoiceWork/RJ157474/t4%20%E3%81%8A%E3%82%84%E3%81%99%E3%81%BF.mp3'
    )
  })

  it('should return correct offload path for subdirectories', function() {
    const baseUrl = '/media/stream/'
    const rootFolderName = 'VoiceWork'
    const workDir = 'second/RJ290139 【CV： 上坂すみれ】'
    const trackSubfolder = 'Necogurashi ep01/mp3'
    const trackTitle = '01 ようこそ猫鳴館(ねこめいかん)へ。～ミケ猫の場合～.mp3'
    if (process.platform === 'win32') {
      expect(joinFragments(baseUrl, rootFolderName, workDir, trackSubfolder, trackTitle)).to.equal(
        '\\media\\stream\\VoiceWork\\second\\RJ290139 【CV： 上坂すみれ】\\Necogurashi ep01\\mp3\\01 ようこそ猫鳴館(ねこめいかん)へ。～ミケ猫の場合～.mp3'
      )
    } else {
      expect(joinFragments(baseUrl, rootFolderName, workDir, trackSubfolder, trackTitle)).to.equal(
        '/media/stream/VoiceWork/second/RJ290139 【CV： 上坂すみれ】/Necogurashi ep01/mp3/01 ようこそ猫鳴館(ねこめいかん)へ。～ミケ猫の場合～.mp3'
      )
    }
  })

  it('should return correct encoded offload URL for subdirectories', function() {
    const baseUrl = 'https://cdn.example.com/media/stream/'
    const rootFolderName = 'VoiceWork'
    const workDir = 'second/RJ290139 【CV： 上坂すみれ】'
    const trackSubfolder = 'Necogurashi ep01/mp3'
    const trackTitle = '01 ようこそ猫鳴館(ねこめいかん)へ。～ミケ猫の場合～.mp3'
    expect(joinFragments(baseUrl, rootFolderName, workDir, trackSubfolder, trackTitle)).to.equal(
      'https://cdn.example.com/media/stream/VoiceWork/second/RJ290139%20%E3%80%90CV%EF%BC%9A%20%E4%B8%8A%E5%9D%82%E3%81%99%E3%81%BF%E3%82%8C%E3%80%91/Necogurashi%20ep01/mp3/01%20%E3%82%88%E3%81%86%E3%81%93%E3%81%9D%E7%8C%AB%E9%B3%B4%E9%A4%A8(%E3%81%AD%E3%81%93%E3%82%81%E3%81%84%E3%81%8B%E3%82%93)%E3%81%B8%E3%80%82%EF%BD%9E%E3%83%9F%E3%82%B1%E7%8C%AB%E3%81%AE%E5%A0%B4%E5%90%88%EF%BD%9E.mp3'
    )
  })

  it('should return correct encoded offload URL for subdirectories on Windows', function() {
    const baseUrl = 'https://cdn.example.com/media/stream/'
    const rootFolderName = 'VoiceWork'
    const workDir = 'second\\RJ290139 【CV： 上坂すみれ】'
    const trackSubfolder = 'Necogurashi ep01\\mp3'
    const trackTitle = '01 ようこそ猫鳴館(ねこめいかん)へ。～ミケ猫の場合～.mp3'
    expect(joinFragments(baseUrl, rootFolderName, workDir, trackSubfolder, trackTitle)).to.equal(
      'https://cdn.example.com/media/stream/VoiceWork/second/RJ290139%20%E3%80%90CV%EF%BC%9A%20%E4%B8%8A%E5%9D%82%E3%81%99%E3%81%BF%E3%82%8C%E3%80%91/Necogurashi%20ep01/mp3/01%20%E3%82%88%E3%81%86%E3%81%93%E3%81%9D%E7%8C%AB%E9%B3%B4%E9%A4%A8(%E3%81%AD%E3%81%93%E3%82%81%E3%81%84%E3%81%8B%E3%82%93)%E3%81%B8%E3%80%82%EF%BD%9E%E3%83%9F%E3%82%B1%E7%8C%AB%E3%81%AE%E5%A0%B4%E5%90%88%EF%BD%9E.mp3'
    )
  })
})
