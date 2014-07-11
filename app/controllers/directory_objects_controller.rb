class DirectoryObjectsController < ApplicationController
  before_action :set_directory_object, only: [:show, :edit, :update, :destroy]

  # GET /directory_objects
  # GET /directory_objects.json
  def index
    if params[:search]
      # Put search query logic here, should search first, last, title, email, name, room_number, type
      results = DirectoryObject.where("first LIKE ?", "%#{params[:search]}%")
      results = results + DirectoryObject.where("last LIKE ?", "%#{params[:search]}%")
      results = results + DirectoryObject.where("title LIKE ?", "%#{params[:search]}%")
      results = results + DirectoryObject.where("email LIKE ?", "%#{params[:search]}%")
      results = results + DirectoryObject.where("name LIKE ?", "%#{params[:search]}%")
      results = results + DirectoryObject.where("room_number LIKE ?", "%#{params[:search]}%")
      results = results + DirectoryObject.where("type LIKE ?", "%#{params[:search]}%")
      @directory_objects = results
    else
      @directory_objects = DirectoryObject.all
    end
  end

  # GET /directory_objects/1
  # GET /directory_objects/1.json
  def show
    @directory_object = DirectoryObject.find(params[:id])
  end
  
  def landing
    render :layout => "landing"
  end
  
  def about
  end
  
  def new
  end
  
  def create
  end
  
  def delete
  end
  
  

  private

  # Use callbacks to share common setup or constraints between actions.
  def set_directory_object
    @directory_object = DirectoryObject.find(params[:id])
  end

  # Never trust parameters from the scary internet, only allow the white list through.
  def directory_object_params
    params.require(:directory_object).permit(:title, :time, :link, :first, :last, :email, :phone, :name, :room_number, :is_bathroom, :rss_feed, :type, :room_id)
  end
end
